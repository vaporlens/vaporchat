import { SteamVoice } from 'vaporchat/client/steamVoice';
import type { VoiceSession } from 'vaporchat/client/voiceSession';
import type { ChatGroup } from 'vaporchat/protocol';
import type { SteamGuardHandler } from 'vaporchat/steam/credentialLogin';
import type { TokenStore } from 'vaporchat/steam/logOn';
import { h, render } from './dom.ts';
import { Playback } from './playback.ts';

/** localStorage key of the Steam refresh token, the live driver sets it too. */
const TOKEN_STORAGE = 'vaporchat-refresh-token';
// browsers can't fetch Steam's server list themselves, server.ts proxies it
const SERVER_LIST_URL = '/cm-list';
const MAX_LOG_LINES = 400;

const tokenStore: TokenStore = {
  load: async () => localStorage.getItem(TOKEN_STORAGE),
  save: async (token) => localStorage.setItem(TOKEN_STORAGE, token),
  clear: async () => localStorage.removeItem(TOKEN_STORAGE),
};

let groups: ChatGroup[] = [];
const logLines: string[] = [];

function log(line: string) {
  logLines.push(`${new Date().toLocaleTimeString()} ${line}`);
  logLines.splice(0, logLines.length - MAX_LOG_LINES);
  const pre = document.getElementById('log');
  if (pre) pre.textContent = logLines.join('\n');
}

function avatar(steamid: string, speaking = false) {
  const url = voice.connection.user(steamid).avatarUrl;
  return h('img', {
    class: speaking ? 'avatar speaking' : 'avatar',
    src: url ?? 'data:,',
    alt: '',
  });
}

function nameOf(steamid: string) {
  if (steamid === voice.me.steamid) return `${voice.me.name} (you)`;
  return voice.connection.user(steamid).name;
}

function sessionTitle(session: VoiceSession) {
  const target = session.target;
  if (target.kind === 'friend') return nameOf(target.steamid);
  const group = groups.find((g) => g.groupId === target.groupId);
  const room = group?.rooms.find((r) => r.chatId === target.chatId);
  return group ? `${group.name} / ${room?.name ?? 'voice'}` : 'Group voice';
}

function renderMe() {
  render(
    'me',
    avatar(voice.me.steamid),
    h(
      'div',
      { class: 'grow' },
      h('div', { class: 'name' }, voice.me.name),
      h('div', { class: 'sub' }, 'vaporchat'),
    ),
    h('button', { onclick: () => void signOut() }, 'Sign out'),
  );
}

function renderIncoming() {
  render(
    'incoming',
    voice.incomingCalls.length > 0 && h('h2', {}, 'Incoming call'),
    ...voice.incomingCalls.map((call) =>
      h(
        'div',
        { class: 'row' },
        avatar(call.steamid),
        h('div', { class: 'grow name' }, nameOf(call.steamid)),
        h(
          'button',
          {
            class: 'ok',
            onclick: () =>
              void startVoice((mic) => voice.acceptCall(call, mic)),
          },
          'Accept',
        ),
        h(
          'button',
          { class: 'danger', onclick: () => void voice.declineCall(call) },
          'Decline',
        ),
      ),
    ),
  );
}

function renderSession() {
  const session = voice.session;
  if (!session) {
    render('session');
    return;
  }
  const me = h(
    'div',
    { class: 'row' },
    avatar(voice.me.steamid, session.speaking.includes(voice.me.steamid)),
    h('div', { class: 'grow name' }, nameOf(voice.me.steamid)),
    h(
      'div',
      { class: 'sub' },
      [
        session.micMuted && 'muted',
        session.outputMuted && 'deafened',
        !session.microphone && 'no mic',
      ]
        .filter(Boolean)
        .join(', '),
    ),
  );
  const others = session.participants.map((p) =>
    h(
      'div',
      { class: 'row' },
      avatar(p.steamid, session.speaking.includes(p.steamid)),
      h('div', { class: 'grow name' }, nameOf(p.steamid)),
      h(
        'div',
        { class: 'sub' },
        [
          p.micMuted && 'muted',
          p.outputMuted && 'deafened',
          p.noMic && 'no mic',
          !p.stream && 'no audio',
        ]
          .filter(Boolean)
          .join(', '),
      ),
    ),
  );
  render(
    'session',
    h('h2', {}, `${sessionTitle(session)} · ${session.state}`),
    me,
    ...others,
    h(
      'div',
      { class: 'controls' },
      h(
        'button',
        {
          class: session.micMuted ? 'on' : '',
          onclick: () => session.setMicMuted(!session.micMuted),
        },
        session.micMuted ? 'Unmute' : 'Mute',
      ),
      h(
        'button',
        {
          class: session.outputMuted ? 'on' : '',
          onclick: () => {
            session.setOutputMuted(!session.outputMuted);
            playback.sync(session.participants, session.outputMuted);
            renderSession();
          },
        },
        session.outputMuted ? 'Undeafen' : 'Deafen',
      ),
      h(
        'button',
        { onclick: () => void toggleMicrophone(session) },
        session.microphone ? 'Mic off' : 'Mic on',
      ),
      h(
        'button',
        { class: 'danger', onclick: () => void session.leave() },
        'Leave',
      ),
    ),
  );
}

function renderGroups() {
  const inviteInput = h('input', {
    name: 'invite',
    placeholder: 'https://s.team/chat/…',
    required: true,
  });
  render(
    'groups',
    h('h2', {}, 'Group voice'),
    ...groups.flatMap((group) =>
      group.rooms
        .filter((room) => room.voiceAllowed)
        .map((room) =>
          h(
            'div',
            { class: 'row' },
            h(
              'div',
              { class: 'grow' },
              h('div', { class: 'name' }, `${group.name} / ${room.name}`),
              h(
                'div',
                { class: 'sub' },
                room.membersInVoice.map(nameOf).join(', ') || 'nobody in voice',
              ),
            ),
            h(
              'button',
              {
                class: 'primary',
                onclick: () =>
                  void startVoice((mic) =>
                    voice.joinGroupVoice(group.groupId, room.chatId, mic),
                  ),
              },
              'Join',
            ),
          ),
        ),
    ),
    h(
      'form',
      {
        onsubmit: (event: Event) => {
          event.preventDefault();
          void joinByInvite((inviteInput as HTMLInputElement).value);
        },
      },
      inviteInput,
      h('button', { type: 'submit' }, 'Join group'),
    ),
  );
}

function renderFriends() {
  render(
    'friends',
    h('h2', {}, 'Friends'),
    ...voice.connection.friends.map((friend) =>
      h(
        'div',
        { class: friend.online ? 'row' : 'row offline' },
        avatar(friend.steamid),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'name' }, friend.name),
          h('div', { class: 'sub' }, friend.online ? 'online' : 'offline'),
        ),
        h(
          'button',
          {
            onclick: () =>
              void startVoice((mic) => voice.callFriend(friend.steamid, mic)),
          },
          'Call',
        ),
      ),
    ),
  );
}

async function refreshGroups() {
  groups = await voice.connection.getGroups();
  renderGroups();
}

async function joinByInvite(inviteLink: string) {
  try {
    await voice.connection.joinGroupByInviteLink(inviteLink);
    await refreshGroups();
  } catch (err) {
    log(`Joining group failed: ${String(err)}`);
    alert(
      `Could not join group: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function getMicrophone() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err) {
    log(`No microphone (${String(err)}), joining listen-only`);
    return null;
  }
}

async function startVoice(
  start: (microphone: MediaStream | null) => Promise<VoiceSession>,
) {
  await start(await getMicrophone());
}

function stopTracks(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

// sessions also start without a click (taking over a simultaneous call), so wire them all here
function wireSession(session: VoiceSession) {
  session.on('log', log);
  session.on('state', renderSession);
  session.on('speaking', renderSession);
  session.on('participants', (participants) => {
    playback.sync(participants, session.outputMuted);
    renderSession();
  });
  session.on('ended', ({ reason }) => {
    log(`Voice ended: ${reason}`);
    // a session taking over a simultaneous call detaches the microphone before this one ends
    stopTracks(session.microphone);
    if (!voice.session) playback.stopAll();
    renderSession();
  });
}

async function toggleMicrophone(session: VoiceSession) {
  const previous = session.microphone;
  await session.setMicrophone(previous ? null : await getMicrophone());
  stopTracks(previous);
  renderSession();
}

// codes through prompt() are enough for a debug page
const steamGuard: SteamGuardHandler = async (prompt) => {
  const approve = 'approve the sign-in in the Steam Mobile app';
  if (!prompt.codeType) {
    render('me', `Please ${approve}…`);
    return new Promise<string>(() => {});
  }
  const code = window.prompt(
    [
      prompt.lastCodeWrong && 'That code was wrong.',
      `Steam Guard ${prompt.codeType} code${prompt.emailDomain ? ` (sent to ${prompt.emailDomain})` : ''}`,
      prompt.canApproveOnDevice && `or ${approve} and cancel this`,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  if (code === null) throw new Error('Sign-in cancelled');
  return code;
};

function signInForm(done: (voice: SteamVoice) => void, error?: string) {
  const accountName = h('input', {
    name: 'account',
    placeholder: 'Account name',
    autocomplete: 'username',
    required: true,
  }) as HTMLInputElement;
  const password = h('input', {
    name: 'password',
    type: 'password',
    placeholder: 'Password',
    autocomplete: 'current-password',
    required: true,
  }) as HTMLInputElement;
  render(
    'me',
    h(
      'form',
      {
        onsubmit: (event: Event) => {
          event.preventDefault();
          render('me', 'Signing in…');
          SteamVoice.logOn(tokenStore, {
            serverListUrl: SERVER_LIST_URL,
            credentials: {
              accountName: accountName.value.trim(),
              password: password.value,
            },
            steamGuard,
          }).then(done, (err: Error) => signInForm(done, err.message));
        },
      },
      accountName,
      password,
      h('button', { type: 'submit', class: 'primary' }, 'Sign in'),
    ),
    error && h('div', { class: 'sub' }, error),
  );
}

/** Logs on with the stored token, or asks for the account when there is none (or Steam rejected it). */
async function signIn() {
  if (await tokenStore.load()) {
    render('me', 'Connecting to Steam…');
    try {
      return await SteamVoice.logOn(tokenStore, {
        serverListUrl: SERVER_LIST_URL,
      });
    } catch (err) {
      // a rejected token was cleared, anything else is worth a reload
      if (await tokenStore.load()) {
        render('me', `Could not connect to Steam: ${String(err)}`);
        throw err;
      }
    }
  }
  return new Promise<SteamVoice>((resolve) => signInForm(resolve));
}

async function signOut() {
  await voice.session?.leave();
  await tokenStore.clear();
  voice.connection.close();
  location.reload();
}

const voice = await signIn();
const playback = new Playback(document.getElementById('audio') as HTMLElement);

voice.on('session', (session) => {
  if (session) wireSession(session);
  renderSession();
});
voice.on('incomingCalls', renderIncoming);
voice.connection.on('groupsChanged', () => void refreshGroups());
voice.connection.on('friendsChanged', () => {
  renderMe();
  renderFriends();
});
voice.connection.on('close', ({ reason }) =>
  render('me', `Lost connection to Steam (${reason}), reload to reconnect.`),
);

groups = await voice.connection.getGroups();
renderMe();
renderFriends();
renderGroups();
log(`Signed in as ${voice.me.steamid}`);

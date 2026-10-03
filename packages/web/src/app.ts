import { SteamVoice } from 'vaporchat/client/steamVoice';
import type { VoiceSession } from 'vaporchat/client/voiceSession';
import type { ChatGroup, Friend } from 'vaporchat/protocol';
import { h, render } from './dom.ts';
import { Playback } from './playback.ts';

const KEY_STORAGE = 'vaporchat-key';
const MAX_LOG_LINES = 400;

// the server prints a link with the key in the hash, remember it and keep it out of the address bar
const hashKey = new URLSearchParams(location.hash.slice(1)).get('key');
if (hashKey) {
  localStorage.setItem(KEY_STORAGE, hashKey);
  history.replaceState(null, '', location.pathname);
}
const key = localStorage.getItem(KEY_STORAGE);

let friends = new Map<string, Friend>();
let groups: ChatGroup[] = [];
const logLines: string[] = [];

function log(line: string) {
  logLines.push(`${new Date().toLocaleTimeString()} ${line}`);
  logLines.splice(0, logLines.length - MAX_LOG_LINES);
  const pre = document.getElementById('log');
  if (pre) pre.textContent = logLines.join('\n');
}

function avatar(steamid: string, speaking = false) {
  const url =
    friends.get(steamid)?.avatarUrl ??
    (steamid === voice.me.steamid ? voice.me.avatarUrl : null);
  return h('img', {
    class: speaking ? 'avatar speaking' : 'avatar',
    src: url ?? 'data:,',
    alt: '',
  });
}

function nameOf(steamid: string) {
  if (steamid === voice.me.steamid) return `${voice.me.name} (you)`;
  return friends.get(steamid)?.name ?? `User ${steamid.slice(-6)}`;
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
    avatar(
      voice.me.steamid,
      playback.isSpeaking(voice.me.steamid) && !session.micMuted,
    ),
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
      avatar(p.steamid, playback.isSpeaking(p.steamid)),
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
    ...[...friends.values()].map((friend) =>
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
  groups = await voice.connection.call('getGroups', {});
  renderGroups();
}

async function joinByInvite(inviteLink: string) {
  try {
    await voice.connection.call('joinGroupByInviteLink', { inviteLink });
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
  // runs in the click handler so mobile browsers allow audio playback
  playback.unlock();
  await start(await getMicrophone());
}

function stopTracks(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

// sessions also start without a click (taking over a simultaneous call), so wire them all here
function wireSession(session: VoiceSession) {
  playback.watchMicrophone(voice.me.steamid, session.microphone);
  session.on('log', log);
  session.on('state', renderSession);
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
  playback.watchMicrophone(voice.me.steamid, session.microphone);
  renderSession();
}

if (!key) {
  render('me', 'Open the link printed by the vaporchat server to sign in.');
  throw new Error('No access key');
}

const voice = await SteamVoice.connect(
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?key=${encodeURIComponent(key)}`,
);
const playback = new Playback(
  document.getElementById('audio') as HTMLElement,
  renderSession,
);

voice.on('session', (session) => {
  if (session) wireSession(session);
  renderSession();
});
voice.on('incomingCalls', renderIncoming);
voice.connection.on('groupsChanged', () => void refreshGroups());
voice.connection.on('close', () =>
  render('me', 'Lost connection to the vaporchat server, reload to reconnect.'),
);

const [friendList, groupList] = await Promise.all([
  voice.connection.call('getFriends', {}),
  voice.connection.call('getGroups', {}),
]);
friends = new Map(friendList.map((friend) => [friend.steamid, friend]));
groups = groupList;
renderMe();
renderFriends();
renderGroups();
log(`Signed in as ${voice.me.name} (${voice.me.steamid})`);

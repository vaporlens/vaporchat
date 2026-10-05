// Extracts the protobuf types vaporchat uses (plus everything they reference) from steam-user's
// generated definitions (and the few .proto files next to this script) into steam/protos.generated.ts, so apps don't bundle all of Steam's protocol.
//   bun packages/vaporchat/scripts/generateProtos.ts

import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import protobuf from 'protobufjs';
import { serviceTypeName } from '../steam/serviceTypes.ts';

const SOURCES = [
  'steammessages_base',
  'steammessages_clientserver_login',
  'steammessages_clientserver_friends',
  'steammessages_auth.steamclient',
  'steammessages_chat.steamclient',
  'steammessages_friendmessages.steamclient',
  'friends_mobile',
];

// services steam-user has no definitions for, copied from SteamDatabase/Protobufs
const LOCAL_PROTOS = ['userNews.proto'];

const SERVICE_METHODS = [
  'Authentication.GetPasswordRSAPublicKey',
  'Authentication.BeginAuthSessionViaCredentials',
  'Authentication.UpdateAuthSessionWithSteamGuardCode',
  'Authentication.PollAuthSessionStatus',
  'Authentication.GenerateAccessTokenForApp',
  'ChatRoom.GetMyChatRoomGroups',
  'ChatRoom.SetSessionActiveChatRoomGroups',
  'ChatRoom.GetInviteLinkInfo',
  'ChatRoom.JoinChatRoomGroup',
  'ChatRoom.JoinVoiceChat',
  'ChatRoom.LeaveVoiceChat',
  'ChatRoom.SendChatMessage',
  'ChatRoom.GetMessageHistory',
  'FriendMessages.SendMessage',
  'FriendMessages.GetRecentMessages',
  'WebRTCClient.InitiateWebRTCConnection',
  'WebRTCClient.AcknowledgeUpdatedRemoteDescription',
  'VoiceChat.RequestOneOnOneChat',
  'VoiceChat.AnswerOneOnOneChat',
  'VoiceChat.EndOneOnOneChat',
  'VoiceChat.UpdateVoiceChatWebRTCData',
  'UserNews.GetUserNews',
];

const MESSAGES = [
  'CMsgProtoBufHeader',
  'CMsgMulti',
  'CMsgClientHello',
  'CMsgClientLogon',
  'CMsgClientLogonResponse',
  'CMsgClientHeartBeat',
  'CMsgClientLoggedOff',
  'CMsgClientChangeStatus',
  'CMsgClientPersonaState',
  'CMsgClientFriendsList',
  'CMsgClientRequestFriendData',
  'CMsgClientGetEmoticonList',
  'CMsgClientEmoticonList',
  'CVoiceChat_UserVoiceStatus_Notification',
  'CWebRTC_WebRTCSessionConnected_Notification',
  'CWebRTC_WebRTCUpdateRemoteDescription_Notification',
  'CVoiceChat_OneOnOneChatRequested_Notification',
  'CVoiceChat_OneOnOneChatRequestResponse_Notification',
  'CVoiceChat_UserJoinedVoiceChat_Notification',
  'CVoiceChat_UserLeftVoiceChat_Notification',
  'CVoiceChat_AllMembersStatus_Notification',
  'CVoiceChat_VoiceChatEnded_Notification',
  'CChatRoom_NotifyShouldRejoinChatRoomVoiceChat_Notification',
  'CChatRoom_ChatRoomGroupRoomsChange_Notification',
  'ChatRoomClient_NotifyChatGroupUserStateChanged_Notification',
  'CChatRoom_IncomingChatMessage_Notification',
  'CFriendMessages_IncomingMessage_Notification',
];

const require = createRequire(import.meta.url);
const root = new protobuf.Root();
for (const source of SOURCES) {
  const json = require(`steam-user/protobufs/generated/${source}.json`);
  for (const [name, definition] of Object.entries(
    protobuf.Root.fromJSON(json).nested ?? {},
  )) {
    if (!root.get(name)) root.add(definition);
  }
}
for (const file of LOCAL_PROTOS) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  // steam-user's definitions keep the field names of the .proto files too
  const { nested = {} } = protobuf
    .parse(source, { keepCase: true })
    .root.toJSON() as protobuf.INamespace;
  for (const [name, { edition: _, ...definition }] of Object.entries(
    nested as Record<string, protobuf.IType & { edition?: string }>,
  )) {
    // parsed types say their edition, which the descriptor type doesn't allow
    root.add(protobuf.Type.fromJSON(name, definition));
  }
}
root.resolveAll();

function topLevel(object: protobuf.ReflectionObject) {
  let current = object;
  while (current.parent && current.parent !== root) current = current.parent;
  return current;
}

const included = new Map<string, protobuf.ReflectionObject>();
function include(object: protobuf.ReflectionObject) {
  const top = topLevel(object);
  if (included.has(top.name)) return;
  included.set(top.name, top);
  const visit = (type: protobuf.ReflectionObject) => {
    if (!(type instanceof protobuf.Type)) return;
    for (const field of type.fieldsArray) {
      // a type another source defined first resolves to that source's own copy, take the merged one
      if (field.resolvedType)
        include(root.lookup(field.resolvedType.fullName)!);
    }
    for (const nested of type.nestedArray) visit(nested);
  };
  visit(top);
}

const names = [
  ...MESSAGES,
  ...SERVICE_METHODS.flatMap((method) => [
    serviceTypeName(method, 'Request'),
    serviceTypeName(method, 'Response'),
  ]),
];
for (const name of names) {
  const object = root.get(name);
  if (!object) throw new Error(`No protobuf type ${name}`);
  include(object);
}

const nested = Object.fromEntries(
  [...included.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((object) => [object.name, object.toJSON()]),
);
const output = `// Generated by scripts/generateProtos.ts from steam-user's and scripts/*.proto definitions, do not edit.
import type { INamespace } from 'protobufjs';

export const descriptor: INamespace = ${JSON.stringify({ nested })};
`;
await writeFile(
  new URL('../steam/protos.generated.ts', import.meta.url),
  output,
);
console.log(`Wrote ${included.size} types`);

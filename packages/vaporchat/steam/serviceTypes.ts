// the few methods whose protobuf types don't follow the naming pattern
const TYPE_PREFIXES: Record<string, string> = {
  'Authentication.GenerateAccessTokenForApp':
    'CAuthentication_AccessToken_GenerateForApp',
  'FriendMessages.GetActiveMessageSessions':
    'CFriendsMessages_GetActiveMessageSessions',
};

/** `ChatRoom.JoinVoiceChat#1` → `CChatRoom_JoinVoiceChat_Request` */
export function serviceTypeName(method: string, kind: 'Request' | 'Response') {
  const base = method.replace(/#\d+$/, '');
  const [service, name] = base.split('.');
  return `${TYPE_PREFIXES[base] ?? `C${service}_${name}`}_${kind}`;
}

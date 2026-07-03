export interface PropEntry {
  target: string;
  key: string;
  value: string;
}

export type AccessLevel = 'OWNER' | 'HOST' | 'DENY' | 'GRANT' | 'VOICE';

export interface AccessEntry {
  channel: string;
  level: AccessLevel;
  mask: string;
  timestamp: number;
  setter: string;
  reason: string;
}

export type EventType = 'CHANNEL' | 'MEMBER' | 'USER' | 'SERVER' | 'BROADCAST';

export interface EventSubscription {
  type: EventType;
  mask: string;
}

export interface UserProfile {
  nick: string;
  url?: string;
  gender?: string;
  picture?: string;
  location?: string;
  bio?: string;
  realname?: string;
  email?: string;
  noVideo?: boolean;
}

export interface ChannelProps {
  channel: string;
  oid?: string;
  name?: string;
  creation?: number;
  topic?: string;
  language?: string;
  subject?: string;
  membercount?: number;
  memberlimit?: number;
  pics?: string;
  lag?: string;
  client?: string;
  [key: string]: string | number | undefined;
}

export const CHANNEL_PROP_KEYS = [
  'OID', 'NAME', 'CREATION', 'TOPIC', 'LANGUAGE', 'SUBJECT',
  'MEMBERCOUNT', 'MEMBERLIMIT', 'PICS', 'LAG', 'CLIENT',
] as const;

export const USER_PROFILE_KEYS = [
  'URL', 'GENDER', 'PICTURE', 'LOCATION', 'BIO', 'REALNAME', 'EMAIL', 'no-video',
] as const;

export const ACCESS_LEVELS: AccessLevel[] = ['OWNER', 'HOST', 'VOICE', 'GRANT', 'DENY'];

export const ACCESS_LEVEL_INFO: Record<AccessLevel, { label: string; color: string; icon: string; desc: string }> = {
  OWNER: { label: 'Owner', color: '#f87171', icon: '~', desc: 'Full control over the channel' },
  HOST:  { label: 'Host',  color: '#4ade80', icon: '@', desc: 'Can manage users and settings' },
  VOICE: { label: 'Voice', color: '#fbbf24', icon: '+', desc: 'Can speak in moderated channels' },
  GRANT: { label: 'Grant', color: '#60a5fa', icon: '>', desc: 'Allowed to join the channel' },
  DENY:  { label: 'Deny',  color: '#ef4444', icon: '!', desc: 'Banned from the channel' },
};

export const CHANNEL_MODE_INFO: Record<string, { label: string; param?: boolean }> = {
  i: { label: 'Invite only' },
  m: { label: 'Moderated' },
  n: { label: 'No external messages' },
  p: { label: 'Private' },
  s: { label: 'Secret' },
  t: { label: 'Ops set topic' },
  k: { label: 'Key required', param: true },
  l: { label: 'User limit', param: true },
  r: { label: 'Registered only' },
  R: { label: 'Registered nicks only' },
  c: { label: 'No colors' },
  C: { label: 'No CTCPs' },
  S: { label: 'Strip colors' },
  z: { label: 'TLS only' },
  N: { label: 'No nick changes' },
  Q: { label: 'No kicks' },
  T: { label: 'No notices' },
  u: { label: 'Auditorium' },
  O: { label: 'Opers only' },
  P: { label: 'Permanent' },
};

export const PROP_KEY_INFO: Record<string, { label: string; icon: string }> = {
  OID: { label: 'Object ID', icon: 'key' },
  NAME: { label: 'Display Name', icon: 'text' },
  CREATION: { label: 'Created', icon: 'clock' },
  TOPIC: { label: 'Topic', icon: 'text' },
  LANGUAGE: { label: 'Language', icon: 'globe' },
  SUBJECT: { label: 'Subject', icon: 'tag' },
  MEMBERCOUNT: { label: 'Members', icon: 'users' },
  MEMBERLIMIT: { label: 'Member Limit', icon: 'users' },
  PICS: { label: 'Picture', icon: 'image' },
  LAG: { label: 'Lag', icon: 'clock' },
  CLIENT: { label: 'Client', icon: 'terminal' },
};

export const IRCX_NUMERICS = {
  RPL_ACCESSADD:    '801',
  RPL_ACCESSDELETE: '802',
  RPL_ACCESSSTART:  '803',
  RPL_ACCESSENTRY:  '804',
  RPL_ACCESSEND:    '805',
  RPL_EVENTADD:     '808',
  RPL_EVENTLIST:    '809',
  RPL_EVENTEND:     '810',
  RPL_PROPLIST:     '818',
  RPL_PROPEND:      '819',
  ERR_EVENTDUP:     '821',
  ERR_EVENTMIS:     '822',
  ERR_NOSUCHEVENT:  '823',
  RPL_EVENTDELETE:  '824',
  RPL_EVENTCHANGE:  '825',
  ERR_ACCESS_MISSING: '915',
  ERR_ACCESS_TOOMANY: '916',
  ERR_PROP_TOOMANY:   '917',
  ERR_PROPDENIED:     '918',
  ERR_PROP_MISSING:   '919',
} as const;

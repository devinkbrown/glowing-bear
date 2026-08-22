import { describe, expect, it } from 'vitest';
import {
  isOnyxBufferId,
  makeOnyxBuffer,
  onyxBufferId,
  onyxBufferTarget,
  parseOnyxBufferId,
} from './bufferAdapter';

describe('onyx buffer adapter', () => {
  it('keys buffers as onyx:<server>:<target>, never WeeChat pointers', () => {
    expect(onyxBufferId('eshmaki.me', '#darkbear')).toBe('onyx:eshmaki.me:#darkbear');
    expect(isOnyxBufferId('onyx:eshmaki.me:#darkbear')).toBe(true);
    expect(isOnyxBufferId('0x1a2b3c')).toBe(false);
    expect(parseOnyxBufferId('onyx:eshmaki.me:alice')).toEqual({
      server: 'eshmaki.me',
      target: 'alice',
    });
    expect(onyxBufferTarget('onyx:eshmaki.me:#darkbear')).toBe('#darkbear');
  });

  it('synthesizes a WeeChat-shaped server row with plugin=onyx', () => {
    const buf = makeOnyxBuffer({
      server: 'eshmaki.me',
      target: '*',
      type: 'server',
      nick: 'kain',
    });
    expect(buf.id).toBe('onyx:eshmaki.me:*');
    expect(buf.localVars).toMatchObject({
      type: 'server',
      server: 'eshmaki.me',
      nick: 'kain',
      plugin: 'onyx',
    });
  });

  it('synthesizes channel and query rows', () => {
    const chan = makeOnyxBuffer({
      server: 'ircx.us',
      target: '#lobby',
      type: 'channel',
      nick: 'kain',
      number: 2,
    });
    expect(chan.id).toBe('onyx:ircx.us:#lobby');
    expect(chan.localVars['type']).toBe('channel');
    expect(chan.localVars['channel']).toBe('#lobby');

    const query = makeOnyxBuffer({
      server: 'ircx.us',
      target: 'alice',
      type: 'private',
      nick: 'kain',
    });
    expect(query.id).toBe('onyx:ircx.us:alice');
    expect(query.localVars['type']).toBe('private');
  });
});

import Long from 'long';
import protobuf from 'protobufjs';
import { descriptor } from './protos.generated.ts';

// protobufjs finds `long` through a dynamic require that bundlers (metro, bun) can't see,
// without it 64-bit ids like steamids silently lose precision
protobuf.util.Long = Long;
protobuf.configure();

const root = protobuf.Root.fromJSON(descriptor);

function type(name: string) {
  return root.lookupType(name);
}

export function encodeProto(typeName: string, body: object): Uint8Array {
  const proto = type(typeName);
  return proto.encode(proto.fromObject(body)).finish();
}

/** 64-bit integers come back as decimal strings, bytes as Uint8Array. */
export function decodeProto<T>(typeName: string, bytes: Uint8Array): T {
  const proto = type(typeName);
  return proto.toObject(proto.decode(bytes), { longs: String }) as T;
}

/**
 * Low level event stream client
 */


let EVENT_SOURCE = "unknown-service"

export function setEventSourceName(name: string) {
  EVENT_SOURCE = name
}

export function eventSourceName(): string {
  return EVENT_SOURCE
}

export interface EncodedEvent {
  buffer: Buffer
  headers: { [key: string]: any }
}

export interface EventClientCodec {
  encode: (event: EventicleEvent) => Promise<EncodedEvent>
  decode: (encoded: EncodedEvent) => Promise<EventicleEvent>
}

class EventClientJsonCodec implements EventClientCodec {
  decode(encoded: EncodedEvent): Promise<EventicleEvent> {
    let content = JSON.parse(encoded.buffer.toString("utf8"))
    return Promise.resolve({
      createdAt: encoded.headers.createdAt && encoded.headers.createdAt.toString(),
      source: encoded.headers.source && encoded.headers.source.toString(),
      id: encoded.headers.id && encoded.headers.id.toString(),
      causedByType: encoded.headers.causedByType && encoded.headers.causedByType.toString(),
      causedById: encoded.headers.causedById && encoded.headers.causedById.toString(),
      domainId: encoded.headers.domainId && encoded.headers.domainId.toString(),
      type: encoded.headers.type && encoded.headers.type.toString(),
      data: content
    });
  }

  encode(event: EventicleEvent): Promise<EncodedEvent> {
    return Promise.resolve({
      headers: {
        type: event.type,
        domainId: event.domainId || "",
        id: event.id,
        source: "",
        causedById: "",
        causedByType: "",
        createdAt: `${event.createdAt}`
      },
      buffer: Buffer.from(JSON.stringify(event), "utf8")
    });
  }
}


export interface EventicleEvent {
  id?: string
  type: string
  source?: string
  causedById?: string
  causedByType?: string
  domainId?: string
  createdAt?: number
  data: any
}

export interface EventSubscriptionControl {
    close: () => Promise<void>
}

export interface EventClient {
    /**
     *
     * @param event
     * @param stream
     */
    emit: (event: EventicleEvent[], stream: string) => Promise<void>
    /**
     * Play from persisted storage
     * @param stream
     * @param from
     * @param handler
     * @param onError
     * @param onDone
     */
    coldStream: (stream: string,
                 handler: (event: EventicleEvent) => Promise<void>,
                 onError: (error: any) => void,
                 onDone: () => void) => Promise<EventSubscriptionControl>
    /**
     * Only play hot data.
     * @param stream
     * @param consumerName
     * @param handler
     * @param onError
     */
    hotStream: (stream: string,
                consumerName: string,
                handler: (event: EventicleEvent) => Promise<void>,
                onError: (error: any) => void) => Promise<EventSubscriptionControl>

    /**
     * Play from persisted storage the continue from in memory
     * @param stream
     * @param from
     * @param handler
     * @param onError
     * @param onDone
     */
    coldHotStream: (config: {
        stream: string,
        groupId?: string,
        handler: (event: EventicleEvent) => Promise<void>,
        onError: (error: any) => void
    }) => Promise<EventSubscriptionControl>
}

let EVENT_CLIENT: EventClient
let EVENT_CODEC: EventClientCodec = new EventClientJsonCodec()

export function setEventClientCodec(cl: EventClientCodec) {
  EVENT_CODEC = cl
}

export function setEventClient(cl: EventClient) {
  EVENT_CLIENT = cl
}

export function eventClient(): EventClient {
  return EVENT_CLIENT
}

export function eventClientCodec(): EventClientCodec {
  return EVENT_CODEC
}

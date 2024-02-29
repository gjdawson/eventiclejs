import {
  EncodedEvent,
  EventClient,
  eventClientCodec,
  EventicleEvent,
  EventSubscriptionControl,
  isEncodedEvent
} from "../event-client";

export type OutboxEventList = {
  stream: string
  events: EncodedEvent[]
  persistedAt: Date
}

export type OutboxEventListWithId = { id: string } & OutboxEventList;

export interface EventOutbox {
  persist(events: OutboxEventList): Promise<void>
  readOutbox(): Promise<OutboxEventListWithId[]>
  removeOutboxEntries(events: OutboxEventListWithId[]): Promise<void>
}

export interface OutboxSender {
  notify(): Promise<void>
}

export class OutboxEventClient implements EventClient {

  constructor(private repo: EventOutbox, private sender: OutboxSender, private delegate: EventClient) {
  }

  async emit(event: EventicleEvent[] | EncodedEvent[], stream: string): Promise<void> {
    const events = await Promise.all(event.map(async ev => isEncodedEvent(ev)? ev: eventClientCodec().encode(ev)))
    await this.repo.persist({ events, stream, persistedAt: new Date() })
    this.sender.notify();
  }

  coldHotStream(config: {
    rawEvents: true;
    stream: string | string[];
    groupId: string;
    handler: (event: EncodedEvent) => Promise<void>;
    onError: (error: any) => void
  } | {
    rawEvents: false;
    stream: string | string[];
    groupId: string;
    handler: (event: EventicleEvent) => Promise<void>;
    onError: (error: any) => void
  } | {
    stream: string | string[];
    groupId: string;
    handler: (event: EventicleEvent) => Promise<void>;
    onError: (error: any) => void
  }): Promise<EventSubscriptionControl> {
    return this.delegate.coldHotStream(config)
  }

  coldStream(stream: string, handler: (event: EventicleEvent) => Promise<void>, onError: (error: any) => void, onDone: () => void): Promise<EventSubscriptionControl> {
    return this.delegate.coldStream(stream, handler, onError, onDone);
  }

  hotRawStream(stream: string | string[], consumerName: string, handler: (event: EncodedEvent) => Promise<void>, onError: (error: any) => void): Promise<EventSubscriptionControl> {
    return this.delegate.hotRawStream(stream, consumerName, handler, onError)
  }

  hotStream(stream: string | string[], consumerName: string, handler: (event: EventicleEvent) => Promise<void>, onError: (error: any) => void): Promise<EventSubscriptionControl> {
    return this.delegate.hotStream(stream, consumerName, handler, onError)
  }

  isConnected(): boolean {
    return this.delegate.isConnected();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

}

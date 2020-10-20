import {ICustomPartitioner, Kafka, PartitionerArgs, Producer} from "kafkajs";
import {EventClient, EventicleEvent, EventSubscriptionControl} from "./event-client";
import * as uuid from "uuid"
import logger from "../../logger";

let kafka: Kafka

export async function connectBroker(config: {
  clientId: string, brokers: string[]
}) {
  kafka = new Kafka({
    ssl: false,
    clientId: config.clientId,
    brokers: config.brokers
  })
  //
  // const admin = eventclientKafka.admin()
  // let ret = await admin.connect()
  // console.log(await admin.listTopics())
  //
  // await admin.createTopics({
  //     // validateOnly: false,
  //     // waitForLeaders: false,
  //     // timeout: 2000,
  //     topics: [{
  //         topic: "test-topic"
  //     }],
  // })

  // await admin.disconnect()

  // await producer()
  // await consumer()
}

let DomainAwarePartitioner: ICustomPartitioner = () => {
  return args => {

    // TODO, partition based on the domain ID, if none exists, then .... ?
    return 0
  }
}

async function producer() {
  let num = 0
  const producer = kafka.producer({
    createPartitioner: DomainAwarePartitioner
  })

  await producer.connect()

  setInterval(() => {
    producer.send({
      topic: 'test-topic',
      messages: [
        {value: 'Hello KafkaJS user! ' + (num++)},
      ],
    })
  }, 5000)

  console.log("HAVE FINISHED PRODUCER")
}

async function consumer() {
  const consumer = kafka.consumer({groupId: 'uber-group-2'})

  await consumer.connect()
  await consumer.subscribe({topic: 'test-topic', fromBeginning: true})

  await consumer.run({
    eachMessage: async ({topic, partition, message}) => {

      console.log({
        value: message.value.toString(),
      })
    },
  })

  console.log("HAVE FINISHED CONSUMER")
}

class EventclientKafka implements EventClient {

  producer: Producer

  async connect(): Promise<EventclientKafka> {
    this.producer = kafka.producer({
      createPartitioner: DomainAwarePartitioner
    })
    await this.producer.connect()
    return this
  }

  async clear(topics: string[]) {
    let admin = kafka.admin()
    await admin.connect()
    let existingTopics = await admin.listTopics()

    for(let topic of topics) {
      if (existingTopics.includes(topic)) {
        admin.deleteTopics({
          topics: [topic]
        }).catch(reason => logger.debug("Error tpic cleanup", reason))
      }
    }
  }

  async coldHotStream(config: { stream: string, groupId: string, handler: (event: EventicleEvent) => Promise<void>, onError: (error: any) => void }): Promise<EventSubscriptionControl> {

    if (!config.groupId) {
      config.groupId = uuid.v4()
    }

    let cons = kafka.consumer({groupId: uuid.v4()})

    await cons.connect()

    await cons.subscribe({topic: config.stream, fromBeginning: true})

    cons.run({
      eachMessage: async payload => {
        logger.info("GOT ME A MESSAGE ", payload)
        await config.handler({
          domainId: payload.message.headers.domainId && payload.message.headers.domainId.toString("utf8"),
          type: payload.message.headers.type && payload.message.headers.type.toString("utf8"),
          id: payload.message.headers.id && payload.message.headers.id.toString("utf8"),
          data: JSON.parse(payload.message.value.toString("utf8"))
        })
      }
    })

    return {
      close: async () => {
        await cons.disconnect()
      }
    }
  }

  async coldStream(stream: string, handler: (event: EventicleEvent) => Promise<void>, onError: (error: any) => void, onDone: () => void): Promise<EventSubscriptionControl> {

    let cons = kafka.consumer({groupId: uuid.v4()})

    let adm = kafka.admin()
    await adm.connect()

    let partitionOffsets = await adm.fetchTopicOffsets(stream)
    let latestOffset = Math.max(...partitionOffsets.map(value => parseInt(value.offset)))
    await adm.disconnect()

    console.log("WILL SEEK TO " + latestOffset)

    await cons.connect()

    await cons.subscribe({topic: stream, fromBeginning: true})

    cons.run({
      eachMessage: async payload => {
        logger.info("Cold message lands", payload)
        // TODO, compare the current offset with the greatest calculated offset above. if equal or greater than, bail out now
        try {
          console.log("GOT A COLD MESSAGE " + payload.message.offset)
          await handler({
            domainId: payload.message.headers.domainId && payload.message.headers.domainId.toString("utf8"),
            type: payload.message.headers.type && payload.message.headers.type.toString("utf8"),
            id: payload.message.headers.id && payload.message.headers.id.toString("utf8"),
            data: JSON.parse(payload.message.value.toString("utf8"))
          })
        } finally {
          if (parseInt(payload.message.offset) >= latestOffset - 1) {
            logger.info("FOUND THE END, BAILING")
            onDone()
            await cons.disconnect()
          }
        }
      }
    })

    return {
      close: async () => {
        await cons.disconnect()
      }
    }
  }

  async emit(events: EventicleEvent[], stream: string): Promise<void> {

    let messages = events.map(event => {
      const headers = {
        type: event.type,
        id: event.id
      } as any

      if (event.date) {
        headers.date = event.date
      } else {
        headers.date = new Date().toISOString()
      }

      if (event.domainId) {
        headers.domainId = event.domainId
      }

      return {
        value: JSON.stringify(event.data),    // TODO, convert to appropriate avro message, how to lookup?
        timestamp: event.date,
        headers
      }
    })

    try {
      await this.producer.send({
        topic: stream,
        messages,
      })
    } catch (e) {
      logger.error("Failed in message send", e)
    }
  }

  async hotStream(stream: string, consumerName: string, consumer: (event: EventicleEvent) => Promise<void>, onError: (error: any) => void): Promise<EventSubscriptionControl> {

    let cons = kafka.consumer({groupId: consumerName})

    await cons.connect()
    await cons.subscribe({topic: stream})

    await cons.run({
      eachMessage: async payload => {
        await consumer({
          domainId: payload.message.headers.domainId && payload.message.headers.domainId.toString("utf8"),
          type: payload.message.headers.type && payload.message.headers.type.toString("utf8"),
          id: payload.message.headers.id && payload.message.headers.id.toString("utf8"),

          data: JSON.parse(payload.message.value.toString("utf8"))
        })
      }
    })

    return {
      close: async () => {
        await cons.disconnect()
      }
    }
  }
}

export async function eventClientOnKafka(config: {
  clientId: string, brokers: string[]
}): Promise<EventClient> {
  await connectBroker(config)
  return new EventclientKafka().connect()
}
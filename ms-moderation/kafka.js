const { Kafka } = require('kafkajs');

const brokers = process.env.KAFKA_BROKERS
  ? process.env.KAFKA_BROKERS.split(',').map((broker) => broker.trim())
  : ['localhost:9092'];

const kafka = new Kafka({ brokers, clientId: 'ms-moderation' });
const producer = kafka.producer();
let producerConnected = false;

async function connectProducer() {
  if (producerConnected) return;
  await producer.connect();
  producerConnected = true;
  console.log('ms-moderation Kafka producer connected');
}

async function publish(topic, message) {
  try {
    await connectProducer();
    await producer.send({ topic, messages: [{ value: JSON.stringify(message) }] });
  } catch (err) {
    console.error(`ms-moderation Kafka publish failed for ${topic}:`, err.message);
  }
}

async function createConsumer(groupId, topics, handler) {
  const consumer = kafka.consumer({ groupId });
  await consumer.connect();
  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: true });
  }

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        await handler(topic, payload);
      } catch (err) {
        console.error('ms-moderation Kafka consumer error:', err.message);
      }
    },
  });
  console.log(`ms-moderation Kafka consumer group ${groupId} connected`);
}

module.exports = { publish, createConsumer };

const { Kafka } = require('kafkajs');

const brokers = process.env.KAFKA_BROKERS
  ? process.env.KAFKA_BROKERS.split(',').map((broker) => broker.trim())
  : ['localhost:9092'];

const kafka = new Kafka({ brokers, clientId: 'ms-content' });
const producer = kafka.producer();
let producerConnected = false;

async function connectProducer() {
  if (producerConnected) return;
  try {
    await producer.connect();
    producerConnected = true;
    console.log('ms-content Kafka producer connected');
  } catch (err) {
    console.warn('ms-content Kafka producer failed to connect:', err.message);
  }
}

async function publish(topic, message) {
  try {
    await connectProducer();
    if (!producerConnected) {
      throw new Error('Kafka producer not connected');
    }
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }],
    });
  } catch (err) {
    console.error(`ms-content Kafka publish error for topic ${topic}:`, err.message);
  }
}

async function createConsumer(groupId, topics, handler) {
  const consumer = kafka.consumer({ groupId });
  try {
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
          console.error('ms-content Kafka consumer error handling message:', err.message);
        }
      },
    });

    console.log(`ms-content Kafka consumer group ${groupId} connected`);
  } catch (err) {
    console.warn(`ms-content Kafka consumer failed to connect:`, err.message);
  }
}

module.exports = { publish, createConsumer };

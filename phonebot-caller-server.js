const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const mongoose = require('mongoose');
const natural = require('natural');
const fs = require('fs');
const path = require('path');
const VoiceResponse = twilio.twiml.VoiceResponse;

const app = express();
const PORT = process.env.PORT || 4000;

const accountSid = process.env.YOUR_TWILIO_SID;
const authToken = process.env.YOUR_TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.YOUR_TWILIO_PHONE_NUMBER;
const alertPhone = process.env.YOUR_MOBILE_TO_ALERT;
const mongoUri = process.env.MONGO_URI;
const calendlyLink = 'https://calendly.com/isidro-arismendez/grow-your-business';

const client = twilio(accountSid, authToken);

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('📦 MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

const LeadSchema = new mongoose.Schema({
  source: String,
  timestamp: Date,
  responses: Object,
  transcript: Array
});
const Lead = mongoose.model('Lead', LeadSchema);

let transcript = [];

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

function analyzeSentiment(text) {
  const analyzer = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
  const tokenized = new natural.WordTokenizer().tokenize(text);
  return analyzer.getSentiment(tokenized);
}

function sendAlert(message) {
  client.messages.create({ body: message, from: twilioNumber, to: alertPhone }).catch(console.error);
}

function scheduleCallback(fullName, phone) {
  sendAlert(`📞 Call-back needed: ${fullName} at ${phone}`);
}

function offerCalendlyBooking(name, phone) {
  sendAlert(`📅 ${name} requested a follow-up. Send them this: ${calendlyLink}`);
}

function sendCalendlySMS(name, phone) {
  const text = `Hi ${name}, book your 1-on-1 here: ${calendlyLink}`;
  client.messages.create({ body: text, from: twilioNumber, to: phone }).catch(console.error);
}

function saveTranscriptStep(step, speech, meta = {}) {
  const sentiment = analyzeSentiment(speech);
  transcript.push({ step, speech, sentiment, timestamp: new Date().toISOString(), ...meta });
  if (sentiment >= 3) sendAlert(`🔥 Positive from ${step}: ${speech}`);
  else if (sentiment <= -2) sendAlert(`⚠️ Negative from ${step}: ${speech}`);
}

app.post('/voice', (req, res) => {
  const { phone = '' } = req.query;
  const twiml = new VoiceResponse();
  const gather = twiml.gather({ input: 'speech', action: '/gather-name', method: 'POST', timeout: 5, speechTimeout: 'auto' });
  gather.say({ voice: 'man', language: 'en-US' }, 'Hi, this is Isidro. Let’s get started. What is your full name?');
  twiml.say({ voice: 'man', language: 'en-US' }, "Sorry, I didn’t hear anything. We'll follow up soon. Goodbye!");
  res.type('text/xml').send(twiml.toString());
});

app.post('/gather-name', (req, res) => {
  const speech = req.body.SpeechResult || 'not captured';
  saveTranscriptStep('name', speech);
  const twiml = new VoiceResponse();
  const gather = twiml.gather({ input: 'speech', action: '/gather-location', method: 'POST', timeout: 5, speechTimeout: 'auto' });
  gather.say({ voice: 'man', language: 'en-US' }, 'Thanks. What city or location are you in?');
  twiml.say({ voice: 'man', language: 'en-US' }, "Got it. We’ll contact you soon.");
  res.type('text/xml').send(twiml.toString());
});

app.post('/gather-location', (req, res) => {
  const speech = req.body.SpeechResult || 'not captured';
  saveTranscriptStep('location', speech);
  const twiml = new VoiceResponse();
  const gather = twiml.gather({ input: 'speech', action: '/gather-job', method: 'POST', timeout: 5, speechTimeout: 'auto' });
  gather.say({ voice: 'man', language: 'en-US' }, 'What do you do for work right now?');
  twiml.say({ voice: 'man', language: 'en-US' }, "Understood. We’ll follow up shortly.");
  res.type('text/xml').send(twiml.toString());
});

app.post('/gather-job', (req, res) => {
  const speech = req.body.SpeechResult || 'not captured';
  saveTranscriptStep('job', speech);
  const twiml = new VoiceResponse();
  const gather = twiml.gather({ input: 'speech', action: '/gather-priority', method: 'POST', timeout: 5, speechTimeout: 'auto' });
  gather.say({ voice: 'man', language: 'en-US' }, 'Which is most important to you right now: saving money, making money, or eliminating debt?');
  twiml.say({ voice: 'man', language: 'en-US' }, "Thanks for sharing. We'll be in touch.");
  res.type('text/xml').send(twiml.toString());
});

app.post('/gather-priority', (req, res) => {
  const speech = req.body.SpeechResult || 'not captured';
  saveTranscriptStep('priority', speech);
  const twiml = new VoiceResponse();
  const gather = twiml.gather({ input: 'speech', action: '/gather-income', method: 'POST', timeout: 5, speechTimeout: 'auto' });
  gather.say({ voice: 'man', language: 'en-US' }, 'Can you share your estimated monthly or yearly household income range?');
  twiml.say({ voice: 'man', language: 'en-US' }, "Thank you. We'll have someone follow up shortly.");
  res.type('text/xml').send(twiml.toString());
});

app.post('/gather-income', (req, res) => {
  const speech = req.body.SpeechResult || 'not captured';
  saveTranscriptStep('income', speech);
  const twiml = new VoiceResponse();
  const gather = twiml.gather({ input: 'speech', action: '/gather-part-time-interest', method: 'POST', timeout: 5, speechTimeout: 'auto' });
  gather.say({ voice: 'man', language: 'en-US' }, 'Would you be open to earning income part-time if it fit around your schedule?');
  twiml.say({ voice: 'man', language: 'en-US' }, "Got it. Thank you.");
  res.type('text/xml').send(twiml.toString());
});

app.post('/gather-part-time-interest', (req, res) => {
  const speech = req.body.SpeechResult || 'not captured';
  saveTranscriptStep('part_time_interest', speech);
  const twiml = new VoiceResponse();
  const gather = twiml.gather({ input: 'speech', action: '/final-save', method: 'POST', timeout: 5, speechTimeout: 'auto' });
  gather.say({ voice: 'man', language: 'en-US' }, 'May I send you a link to book a time with me?');
  twiml.say({ voice: 'man', language: 'en-US' }, "No problem. Have a great day.");
  res.type('text/xml').send(twiml.toString());
});

app.post('/final-save', async (req, res) => {
  const speech = req.body.SpeechResult || 'not captured';
  saveTranscriptStep('calendar_permission', speech);
  const phone = transcript.find(t => t.phone)?.phone || alertPhone;
  const name = transcript.find(t => t.name)?.name || 'Prospect';
  sendCalendlySMS(name, phone);
  await new Lead({ source: 'PhoneBot', timestamp: new Date(), responses: {}, transcript: [...transcript] }).save();
  transcript = [];
  const twiml = new VoiceResponse();
  twiml.say({ voice: 'man', language: 'en-US' }, 'Thanks again for your time. Talk soon!');
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

app.listen(PORT, () => console.log(`📞 PhoneBot running on port ${PORT}`));

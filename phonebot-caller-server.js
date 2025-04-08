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
  const { name = 'there', ref = 'a friend', phone = '' } = req.query;
  const twiml = new VoiceResponse();

  const gather = twiml.gather({
    input: 'speech',
    action: `https://phonebot-live.onrender.com/interest?name=${name}&phone=${phone}`,
    method: 'POST',
    timeout: 5,
    speechTimeout: 'auto'
  });

  gather.say({ voice: 'man', language: 'en-GB' }, `Hi ${name}, this is Isidro. You were referred by ${ref}. Do you want to save money, make money, or eliminate debt?`);

  twiml.say({ voice: 'man', language: 'en-GB' }, "Sorry, I didn’t hear anything. We’ll call you back soon. Goodbye!");

  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/interest', (req, res) => {
  const speech = req.body.SpeechResult || 'unknown';
  const { name, phone } = req.query;
  saveTranscriptStep('interest', speech, { name, phone });
  if (speech.includes('call') || speech.includes('later')) scheduleCallback(name, phone);
  if (speech.includes('appointment') || speech.includes('schedule')) offerCalendlyBooking(name, phone);
  const twiml = new VoiceResponse();
  const gather = twiml.gather({ input: 'speech', action: '/goals', method: 'POST', timeout: 5, speechTimeout: 'auto' });
  gather.say({ voice: 'man', language: 'en-GB' }, 'What line of work are you in currently?');
  twiml.say({ voice: 'man', language: 'en-GB' }, "Sorry, I didn’t catch that. We’ll follow up later.");
  res.type('text/xml').send(twiml.toString());
});

app.post('/goals', (req, res) => {
  const speech = req.body.SpeechResult || 'unknown';
  saveTranscriptStep('goals', speech);
  const twiml = new VoiceResponse();
  const gather = twiml.gather({ input: 'speech', action: '/retire', method: 'POST', timeout: 5, speechTimeout: 'auto' });
  gather.say({ voice: 'man', language: 'en-GB' }, 'Is this a career or a stepping stone?');
  twiml.say({ voice: 'man', language: 'en-GB' }, "Thank you. We’ll be in touch.");
  res.type('text/xml').send(twiml.toString());
});

app.post('/retire', (req, res) => {
  const speech = req.body.SpeechResult || 'not stated';
  saveTranscriptStep('retire', speech);
  const twiml = new VoiceResponse();
  const gather = twiml.gather({ input: 'speech', action: '/income', method: 'POST', timeout: 5, speechTimeout: 'auto' });
  gather.say({ voice: 'man', language: 'en-GB' }, 'What is your ideal income?');
  twiml.say({ voice: 'man', language: 'en-GB' }, "Got it. Thank you for your time.");
  res.type('text/xml').send(twiml.toString());
});

app.post('/income', (req, res) => {
  const speech = req.body.SpeechResult || 'not provided';
  saveTranscriptStep('income', speech);
  const twiml = new VoiceResponse();
  const gather = twiml.gather({ input: 'speech', action: '/final-save', method: 'POST', timeout: 5, speechTimeout: 'auto' });
  gather.say({ voice: 'man', language: 'en-GB' }, 'How long will it take to reach that income?');
  twiml.say({ voice: 'man', language: 'en-GB' }, "We’ll circle back soon. Goodbye!");
  res.type('text/xml').send(twiml.toString());
});

app.post('/final-save', async (req, res) => {
  const speech = req.body.SpeechResult || 'not defined';
  saveTranscriptStep('timeline', speech);
  const phone = transcript.find(t => t.phone)?.phone || alertPhone;
  const name = transcript.find(t => t.name)?.name || 'Prospect';
  sendCalendlySMS(name, phone);
  await new Lead({ source: 'PhoneBot', timestamp: new Date(), responses: { timeline: speech }, transcript: [...transcript] }).save();
  transcript = [];
  const twiml = new VoiceResponse();
  twiml.say({ voice: 'man', language: 'en-GB' }, 'Thanks for your time. A licensed rep will follow up. Have a great day!');
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/transcripts', async (req, res) => {
  const leads = await Lead.find({}).lean();
  res.json(leads);
});

app.listen(PORT, () => console.log(`📞 PhoneBot running on port ${PORT}`));
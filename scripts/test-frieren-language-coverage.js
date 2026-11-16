import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFrierenMessages, generateFrierenReply } from '../frieren-chat.js';

// These fixtures check that multilingual instructions and the user's exact
// latest message reach the inference boundary. They do not claim to measure
// the model's real-world fluency in each language.
const languageSamples = [
  ['mi', 'Māori', 'Kia ora, e hoa.'],
  ['qu', 'Quechua', 'Rimaykullayki.'],
  ['gn', 'Guarani', 'Mba’éichapa.'],
  ['nv', 'Navajo', 'Yáʼátʼééh.'],
  ['chr', 'Cherokee', 'ᎣᏏᏲ.'],
  ['bo', 'Tibetan', 'བཀྲ་ཤིས་བདེ་ལགས།'],
  ['ug', 'Uyghur', 'ياخشىمۇسىز؟'],
  ['jv', 'Javanese', 'Piye kabare?'],
  ['su', 'Sundanese', 'Kumaha damang?'],
  ['ceb', 'Cebuano', 'Kumusta ka?'],
  ['lb', 'Luxembourgish', 'Wéi geet et?'],
  ['mt', 'Maltese', 'Kif int?'],
  ['yi', 'Yiddish', 'װי אַזױ?'],
  ['eo', 'Esperanto', 'Kiel vi fartas?'],
  ['la', 'Latin', 'Quid agis?'],
  ['kl', 'Greenlandic', 'Qanoq ippit?'],
  ['haw', 'Hawaiian', 'Aloha, pehea ʻoe?'],
  ['br', 'Breton', 'Demat deoc’h.'],
  ['oc', 'Occitan', 'Cossí vas?'],
  ['fo', 'Faroese', 'Hvussu gongur?'],
  ['co', 'Corsican', 'Cumu si?'],
  ['se', 'Northern Sami', 'Bures.'],
  ['sah', 'Sakha', 'Дорообо.'],
  ['ba', 'Bashkir', 'Һаумыһығыҙ.'],
  ['tt', 'Tatar', 'Исәнмесез.'],
  ['sd', 'Sindhi', 'توھان ڪيئن آھيو؟'],
  ['or', 'Odia', 'ଆପଣ କେମିତି ଅଛନ୍ତି?'],
  ['si', 'Sinhala', 'ඔබට කොහොමද?'],
  ['dv', 'Dhivehi', 'ހާލު ކިހިނެއް؟'],
  ['ckb', 'Sorani Kurdish (Arabic script)', 'بەخێربێیت.']
];

test('global language coverage keeps diverse ISO 639-1 and ISO 639-3 messages intact', () => {
  const priorTurn = { role: 'assistant', content: 'The previous reply was in Turkish.' };

  for (const [code, language, message] of languageSamples) {
    assert.match(code, /^[a-z]{2,3}$/i, `invalid ISO sample code for ${language}`);
    const built = buildFrierenMessages({ history: [priorTurn], userMessage: message });
    const systemPrompt = built[0].content;

    assert.match(systemPrompt, /EN SON mesajından/i, `latest-message precedence missing for ${language}`);
    assert.match(systemPrompt, /ISO 639-1/i, `ISO 639-1 support missing for ${language}`);
    assert.match(systemPrompt, /ISO 639-3/i, `ISO 639-3 support missing for ${language}`);
    assert.match(systemPrompt, /yanıtının tamamını aynı dilde yaz/i, `same-language response rule missing for ${language}`);
    assert.equal(built.at(-1).role, 'user');
    assert.equal(built.at(-1).content, message, `input was changed for ${language}`);
  }
});

test('global language instructions and the original script reach every inference request', async () => {
  for (const [code, language, message] of languageSamples) {
    let requestBody;
    const answer = await generateFrierenReply({
      userMessage: message,
      env: { GEMINI_API_KEY: 'test-key', GEMINI_CHAT_MODEL: 'language-contract-test' },
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({ candidates: [{ content: { parts: [{ text: message }] } }] })
        };
      }
    });

    const systemPrompt = requestBody.systemInstruction.parts[0].text;
    assert.match(systemPrompt, /EN SON mesajından/i, `latest-message rule not sent for ${language}`);
    assert.match(systemPrompt, /ISO 639-3/i, `broad language policy not sent for ${language}`);
    assert.equal(requestBody.contents.at(-1).parts[0].text, message, `inference input changed for ${language} (${code})`);
    assert.equal(answer, message, `mock inference response was not returned for ${language}`);
  }
});

test('an explicit request to answer in another language takes precedence over the message language', () => {
  const systemPrompt = buildFrierenMessages({
    userMessage: '¿Puedes responder en japonés, por favor?'
  })[0].content;
  assert.match(systemPrompt, /kullanıcı açıkça başka dilde cevap isterse o isteği izle/i);
});

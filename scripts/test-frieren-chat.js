import { buildMemoryContext, extractExplicitMemories, getRelevantMemories } from '../frieren-memory.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFrierenMessages,
  generateFrierenReply,
  extractFrierenPrompt,
  isCodeOrSourceRequest,
  isFrierenCreator,
  isFrierenMentionMessage
} from '../frieren-chat.js';

test('Frieren responds only to a direct mention in a guild by a human user', () => {
  const base = {
    guild: { id: 'guild-1' },
    author: { id: 'user-1', bot: false },
    mentions: { users: { has: id => id === 'bot-1' } },
    content: '<@bot-1> Merhaba Frieren'
  };
  assert.equal(isFrierenMentionMessage(base, 'bot-1'), true);
  assert.equal(isFrierenMentionMessage({ ...base, guild: null }, 'bot-1'), false);
  assert.equal(isFrierenMentionMessage({ ...base, author: { bot: true } }, 'bot-1'), false);
  assert.equal(isFrierenMentionMessage({ ...base, mentions: { users: { has: () => false } } }, 'bot-1'), false);
});

test('creator recognition requires an exact server-configured Discord user ID match', () => {
  assert.equal(isFrierenCreator({ author: { id: '123456789012345678' } }, { FRIEREN_CREATOR_USER_ID: '123456789012345678' }), true);
  assert.equal(isFrierenCreator({ author: { id: '123456789012345679' } }, { FRIEREN_CREATOR_USER_ID: '123456789012345678' }), false);
  assert.equal(isFrierenCreator({ author: { id: '123456789012345678' } }, {}), false);
  assert.equal(isFrierenCreator({ author: { id: '123456789012345678' } }, { FRIEREN_CREATOR_USER_ID: '  ' }), false);
});

test('only verified creator identity is injected into Frieren system context', () => {
  const creatorPrompt = buildFrierenMessages({ userMessage: 'Merhaba', creatorIdentity: 'Soirəe' })[0].content;
  const ordinaryPrompt = buildFrierenMessages({ userMessage: 'Merhaba' })[0].content;
  assert.match(creatorPrompt, /yapımcın ve geliştiricin Soirəe/);
  assert.match(creatorPrompt, /Fern de Soirəe'nin seni oluşturan.*bildiğini/);
  assert.match(creatorPrompt, /Soirəe'nin kim olduğunu tekrar tekrar sormaz/);
  assert.match(creatorPrompt, /yönetici yetkisi.*vermez/);
  assert.doesNotMatch(ordinaryPrompt, /yapımcın ve geliştiricin Soirəe/);
});

test('mention parser removes both Discord mention formats and rejects empty prompts', () => {
  assert.equal(extractFrierenPrompt('<@bot-1> Merhaba', 'bot-1'), 'Merhaba');
  assert.equal(extractFrierenPrompt('<@!bot-1> Nasılsın?', 'bot-1'), 'Nasılsın?');
  assert.equal(extractFrierenPrompt('<@bot-1>   ', 'bot-1'), '');
  assert.equal(extractFrierenPrompt('Merhaba', 'bot-1'), 'Merhaba');
});

test('conversation builder keeps the Frieren persona and separates prior turns from the new prompt', () => {
  const messages = buildFrierenMessages({
    history: [
      { role: 'user', content: 'Merhaba' },
      { role: 'assistant', content: 'Merhaba. Uzun zaman oldu.' }
    ],
    userMessage: 'Beni hatırlıyor musun?'
  });
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /Frieren/i);
  assert.deepEqual(messages.slice(1), [
    { role: 'user', content: 'Merhaba' },
    { role: 'assistant', content: 'Merhaba. Uzun zaman oldu.' },
    { role: 'user', content: 'Beni hatırlıyor musun?' }
  ]);
});

test('mention handler loads only this guild and user history, then stores both turns', async () => {
  const calls = [];
  const replies = [];
  const message = {
    guild: { id: 'guild-7' },
    channelId: 'channel-1',
    author: { id: '123456789012345678', bot: false },
    mentions: { users: { has: id => id === 'bot-1' } },
    content: '<@bot-1> Nasılsın?',
    reply: async payload => replies.push(payload)
  };
  const db = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT')) return { rows: [{ role: 'user', content: 'Önceki soru' }] };
      return { rows: [] };
    }
  };
  const handled = await (await import('../frieren-chat.js')).handleFrierenMentionMessage({
    message,
    botUserId: 'bot-1',
    db,
    env: { GEMINI_API_KEY: 'test-key', FRIEREN_CREATOR_USER_ID: '123456789012345678' },
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
      assert.equal(options.headers['x-goog-api-key'], 'test-key');
      assert.match(body.systemInstruction.parts[0].text, /Frieren/i);
      assert.match(body.systemInstruction.parts[0].text, /yapımcın ve geliştiricin Soirəe/);
      assert.match(body.systemInstruction.parts[0].text, /Fern de Soirəe'nin seni oluşturan/);
      assert.equal(body.generationConfig.maxOutputTokens, 700);
      assert.equal(body.contents.length, 1);
      assert.equal(body.contents[0].role, 'user');
      assert.equal(body.contents[0].parts[0].text, 'Önceki soru');
      assert.equal(body.contents[0].parts[1].text, 'Nasılsın?');
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'İyiyim. Sen nasılsın?' }] } }] }) };
    }
  });

  assert.equal(handled, true);
  const historyCall = calls.find(call => call.sql.includes('SELECT role, content'));
  const insertCall = calls.find(call => call.sql.includes('INSERT INTO frieren_chat_messages'));
  assert.deepEqual(historyCall.params, ['guild-7', '123456789012345678', 'channel-1', 16]);
  assert.deepEqual(insertCall.params, ['guild-7', '123456789012345678', 'channel-1', 'Nasılsın?', 'İyiyim. Sen nasılsın?']);
  assert.equal(replies[0].content, 'İyiyim. Sen nasılsın?');
  assert.deepEqual(replies[0].allowedMentions, { parse: [] });
});

test('mention handler ignores messages without the bot mention and gives a safe setup response without an API key', async () => {
  let queried = false;
  const base = {
    guild: { id: 'guild-1' },
    author: { id: 'user-1', bot: false },
    mentions: { users: { has: () => true } },
    content: '<@bot-1> Merhaba',
    reply: async () => {}
  };
  assert.equal(await (await import('../frieren-chat.js')).handleFrierenMentionMessage({
    message: { ...base, mentions: { users: { has: () => false } } },
    botUserId: 'bot-1',
    db: { query: async () => { queried = true; return { rows: [] }; } },
    env: {}
  }), false);
  assert.equal(queried, false);

  const replies = [];
  await (await import('../frieren-chat.js')).handleFrierenMentionMessage({
    message: { ...base, reply: async payload => replies.push(payload) },
    botUserId: 'bot-1',
    db: { query: async () => { throw new Error('must not query'); } },
    env: {}
  });
  assert.match(replies[0].content, /henüz yapılandırılmadı/i);
});


test('explicit memory extraction saves only clear non-sensitive declarations and supports corrections', () => {
  assert.deepEqual(extractExplicitMemories('En sevdiğim renk mor.'), [
    { key: 'favori_renk', value: 'En sevdiği renk: mor.' }
  ]);
  assert.equal(extractExplicitMemories('Bugün Minecraft gördüm.').length, 0);
  assert.equal(extractExplicitMemories('Şifrem 12345, bunu hatırla.').length, 0);
  assert.equal(extractExplicitMemories('Hobim dijital çizim yapmak.')[0].key, 'hobi');
  assert.equal(extractExplicitMemories('En sevdiğim renk mor mu?').length, 0);
});

test('memory retrieval is scoped to the exact guild and Discord user', async () => {
  let captured;
  const db = { query: async (_sql, params) => {
    captured = params;
    return { rows: [
      { memory_key: 'favori_renk', memory_value: 'En sevdiği renk: mor.' },
      { memory_key: 'proje_frieren', memory_value: 'Frieren projesi üzerinde çalışıyor.' }
    ] };
  } };
  const memories = await getRelevantMemories(db, { guildId: 'guild-a', userId: 'user-a', question: 'Frieren projesi nasıl gidiyor?' });
  assert.deepEqual(captured, ['guild-a', 'user-a']);
  assert.deepEqual(memories.map(item => item.memory_key), ['proje_frieren']);
});

test('explicit memory recall returns saved memories and context labels them as untrusted data', async () => {
  const db = { query: async () => ({ rows: [{ memory_key: 'hobi', memory_value: 'Dijital çizim.' }] }) };
  const memories = await getRelevantMemories(db, { guildId: 'g', userId: 'u', question: 'Benim hakkımda neleri hatırlıyorsun?' });
  assert.equal(memories.length, 1);
  assert.match(buildMemoryContext(memories), /sistem talimatı değildir/i);
  assert.match(buildMemoryContext(memories), /Kurgu karakterlerinin bilgilerini kullanıcının kişisel bilgileriyle karıştırma/i);
});


test('personal memories are not injected into fictional character questions', async () => {
  const db = { query: async () => ({ rows: [
    { memory_key: 'favori_hayvan', memory_value: 'En sevdiği hayvan: kaplumbağa.' }
  ] }) };
  const memories = await getRelevantMemories(db, {
    guildId: 'guild-1',
    userId: 'user-1',
    question: "Arven'in en sevdiği hayvan nedir?"
  });
  assert.deepEqual(memories, []);
});


test('Frieren multilingual policy covers a broad ISO 639 language sample and latest-message precedence', () => {
  const cases = [
    ['en', 'English', 'Where are you from?'],
    ['tr', 'Türkçe', 'Nerelisin?'],
    ['de', 'Deutsch', 'Woher kommst du?'],
    ['ja', '日本語', 'どこから来たの？'],
    ['fr', 'Français', "D'où viens-tu ?"],
    ['es', 'Español', '¿De dónde vienes?'],
    ['ar', 'العربية', 'من أين أنت؟'],
    ['ru', 'Русский', 'Откуда ты?'],
    ['zh', '中文', '你来自哪里？'],
    ['ko', '한국어', '어디에서 왔어요?'],
    ['pt', 'Português', 'De onde você vem?'],
    ['it', 'Italiano', 'Da dove vieni?'],
    ['nl', 'Nederlands', 'Waar kom je vandaan?'],
    ['hi', 'हिन्दी', 'तुम कहाँ से हो?'],
    ['fa', 'فارسی', 'اهل کجا هستی؟'],
    ['pl', 'Polski', 'Skąd pochodzisz?'],
    ['uk', 'Українська', 'Звідки ти?'],
    ['th', 'ไทย', 'คุณมาจากไหน?'],
    ['bn', 'বাংলা', 'তুমি কোথা থেকে এসেছ?'],
    ['ur', 'اردو', 'آپ کہاں سے ہیں؟'],
    ['vi', 'Tiếng Việt', 'Bạn đến từ đâu?'],
    ['id', 'Bahasa Indonesia', 'Kamu berasal dari mana?'],
    ['ms', 'Bahasa Melayu', 'Awak berasal dari mana?'],
    ['sw', 'Kiswahili', 'Unatoka wapi?'],
    ['el', 'Ελληνικά', 'Από πού είσαι;'],
    ['he', 'עברית', 'מאיפה את?'],
    ['ro', 'Română', 'De unde vii?'],
    ['cs', 'Čeština', 'Odkud pocházíš?'],
    ['sv', 'Svenska', 'Var kommer du ifrån?'],
    ['da', 'Dansk', 'Hvor kommer du fra?'],
    ['no', 'Norsk', 'Hvor kommer du fra?'],
    ['fi', 'Suomi', 'Mistä tulet?'],
    ['hu', 'Magyar', 'Honnan jöttél?'],
    ['bg', 'Български', 'Откъде си?'],
    ['sr', 'Српски', 'Одакле си?'],
    ['hr', 'Hrvatski', 'Odakle dolaziš?'],
    ['sk', 'Slovenčina', 'Odkiaľ pochádzaš?'],
    ['sl', 'Slovenščina', 'Od kod prihajaš?'],
    ['lt', 'Lietuvių', 'Iš kur esi?'],
    ['lv', 'Latviešu', 'No kurienes tu esi?'],
    ['et', 'Eesti', 'Kust sa pärit oled?'],
    ['am', 'አማርኛ', 'ከየት ነህ?'],
    ['yo', 'Yorùbá', 'Níbo lo ti wá?'],
    ['ha', 'Hausa', 'Daga ina kake?'],
    ['zu', 'isiZulu', 'Uvelaphi?'],
    ['af', 'Afrikaans', 'Waar kom jy vandaan?'],
    ['tl', 'Filipino', 'Saan ka nagmula?'],
    ['my', 'မြန်မာ', 'မင်းဘယ်ကလာတာလဲ။'],
    ['km', 'ភាសាខ្មែរ', 'អ្នកមកពីណា?'],
    ['lo', 'ລາວ', 'ເຈົ້າມາຈາກໃສ?'],
    ['mn', 'Монгол', 'Чи хаанаас ирсэн бэ?'],
    ['ne', 'नेपाली', 'तिमी कहाँबाट आएका हौ?'],
    ['ta', 'தமிழ்', 'நீங்கள் எங்கிருந்து வருகிறீர்கள்?'],
    ['te', 'తెలుగు', 'మీరు ఎక్కడి నుండి వచ్చారు?'],
    ['mr', 'मराठी', 'तू कुठून आला आहेस?'],
    ['gu', 'ગુજરાતી', 'તમે ક્યાંથી છો?'],
    ['kn', 'ಕನ್ನಡ', 'ನೀವು ಎಲ್ಲಿಂದ ಬಂದಿದ್ದೀರಿ?'],
    ['ml', 'മലയാളം', 'നിങ്ങൾ എവിടെ നിന്നാണ്?'],
    ['pa', 'ਪੰਜਾਬੀ', 'ਤੁਸੀਂ ਕਿੱਥੋਂ ਹੋ?'],
    ['ku', 'Kurdî', 'Tu ji ku derê yî?'],
    ['ps', 'پښتو', 'ته د کوم ځای یې؟'],
    ['az', 'Azərbaycanca', 'Sən haradansan?'],
    ['kk', 'Қазақша', 'Сен қайдансың?'],
    ['uz', 'Oʻzbekcha', 'Sen qayerdansan?'],
    ['hy', 'Հայերեն', 'Դու որտեղի՞ց ես։'],
    ['ka', 'ქართული', 'საიდან ხარ?'],
    ['sq', 'Shqip', 'Nga je?'],
    ['is', 'Íslenska', 'Hvaðan ertu?'],
    ['ga', 'Gaeilge', 'Cad as duit?'],
    ['cy', 'Cymraeg', 'O ble wyt ti?'],
    ['eu', 'Euskara', 'Nongoa zara?'],
    ['ca', 'Català', 'D’on ets?'],
    ['gl', 'Galego', 'De onde es?']
  ];

  const systemPrompt = buildFrierenMessages({ userMessage: 'Hello.' })[0].content;
  assert.match(systemPrompt, /ISO 639-1/i);
  assert.match(systemPrompt, /ISO 639-3/i);
  assert.match(systemPrompt, /belirsiz/i);

  for (const [code, language, message] of cases) {
    assert.match(code, /^[a-z]{2,3}$/i, `invalid ISO 639 sample code for ${language}`);
    const messages = buildFrierenMessages({
      history: [{ role: 'assistant', content: 'Önceki yanıt Türkçeydi.' }],
      userMessage: message
    });
    assert.match(messages[0].content, /EN SON mesajından/i, `latest-message rule missing for ${language}`);
    assert.match(messages[0].content, /ISO 639-1/i, `ISO 639-1 coverage policy missing for ${language}`);
    assert.match(messages[0].content, /yanıtının tamamını aynı dilde yaz/i, `same-language rule missing for ${language}`);
    assert.equal(messages.at(-1).content, message, `latest user message changed for ${language}`);
  }
});

test('Frieren multilingual policy does not force Turkish for ambiguous or mixed-language messages', () => {
  const systemPrompt = buildFrierenMessages({ userMessage: '🙂' })[0].content;
  assert.match(systemPrompt, /birden fazla dil/i);
  assert.match(systemPrompt, /dil netleştirme sorusu/i);
  assert.match(systemPrompt, /önceki konuşma dilini otomatik olarak dayatma/i);
});

test('Frieren explicitly answers Kurmanji and Sorani Kurdish in the same language', () => {
  const userMessage = 'Çi heye?';
  const messages = buildFrierenMessages({
    history: [{ role: 'assistant', content: 'Önceki yanıt Türkçeydi.' }],
    userMessage
  });
  assert.match(messages[0].content, /Kürtçe.*Kurmancî ve Soranî/i);
  assert.match(messages[0].content, /Çi heye\?/);
  assert.match(messages[0].content, /Türkçe sanma/i);
  assert.equal(messages.at(-1).content, userMessage);
});

test('Kurdish language guidance is sent to the model for a real inference request', async () => {
  let requestBody;
  const answer = await generateFrierenReply({
    userMessage: 'Çi heye?',
    env: { GEMINI_API_KEY: 'test-key', GEMINI_CHAT_MODEL: 'test-model' },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'Ez baş im, spas. Tu çawa yî?' }] } }] })
      };
    }
  });

  assert.match(requestBody.systemInstruction.parts[0].text, /Kurmancî ve Soranî/i);
  assert.equal(requestBody.contents.at(-1).parts[0].text, 'Çi heye?');
  assert.equal(answer, 'Ez baş im, spas. Tu çawa yî?');
});

test('Frieren persona uses canonical identity and forbids invented appearance or server-based identity', () => {
  const systemPrompt = buildFrierenMessages({ userMessage: 'Kendini tanıt.' })[0].content;
  assert.match(systemPrompt, /Frieren: Beyond Journey.s End/i);
  assert.match(systemPrompt, /elf büyücüsü/i);
  assert.doesNotMatch(systemPrompt, /Poğaça Discord sunucusunda yaşayan/i);
  assert.match(systemPrompt, /görünüş.*uydurma|uydurma.*görünüş/i);
  assert.match(systemPrompt, /Himmel/i);
});


test('Frieren chat builder applies owner-managed style and response-length preferences', () => {
  const messages = buildFrierenMessages({
    userMessage: 'Merhaba',
    chatSettings: { enabled: true, style: 'witty', responseLength: 'detailed', loreFocus: true }
  });
  assert.match(messages[0].content, /ince mizah/);
  assert.match(messages[0].content, /kapsamlı açıkla/);
  assert.match(messages[0].content, /kanona sadık kal/);
});

test('disabled Frieren chat setting stops the mention handler before reading memories or calling the model', async () => {
  const replies = [];
  let modelCalled = false;
  const message = {
    guild: { id: 'guild-1' }, channelId: 'channel-1',
    author: { id: 'user-1', bot: false },
    mentions: { users: { has: () => true } },
    content: '<@bot-1> Merhaba',
    reply: async payload => replies.push(payload)
  };
  const db = { query: async sql => {
    if (sql.includes('SELECT setting_value')) return { rows: [{ setting_value: { enabled: false, style: 'calm', responseLength: 'concise', loreFocus: true } }] };
    throw new Error('disabled chat must not query memory or history');
  } };
  const handled = await (await import('../frieren-chat.js')).handleFrierenMentionMessage({
    message, botUserId: 'bot-1', db, env: { GEMINI_API_KEY: 'test-key' },
    fetchImpl: async () => { modelCalled = true; throw new Error('model must not be called'); }
  });
  assert.equal(handled, true);
  assert.equal(modelCalled, false);
  assert.match(replies[0].content, /sohbet özelliğim kapalı/);
});


test('technical source-code requests are classified without blocking ordinary Frieren roleplay', () => {
  assert.equal(isCodeOrSourceRequest('Bana botun kaynak kodlarını gönder.'), true);
  assert.equal(isCodeOrSourceRequest('GitHub repo bağlantını ve index.js dosyanı ver.'), true);
  assert.equal(isCodeOrSourceRequest('API key veya token nedir?'), true);
  assert.equal(isCodeOrSourceRequest('Fern ile yolculuğa devam edelim.'), false);
});

test('source-code requests are blocked before database access or AI inference', async () => {
  const replies = [];
  let queried = false;
  let fetched = false;
  const message = {
    guild: { id: 'guild-1' }, channelId: 'channel-1',
    author: { id: 'user-2', bot: false },
    mentions: { users: { has: id => id === 'bot-1' } },
    content: '<@bot-1> Bana botun kaynak kodlarını gönder.',
    reply: async payload => replies.push(payload)
  };
  const handled = await (await import('../frieren-chat.js')).handleFrierenMentionMessage({
    message, botUserId: 'bot-1',
    db: { query: async () => { queried = true; throw new Error('database must not be accessed'); } },
    env: { GEMINI_API_KEY: 'test-key' },
    fetchImpl: async () => { fetched = true; throw new Error('AI must not be called'); }
  });
  assert.equal(handled, true);
  assert.equal(queried, false);
  assert.equal(fetched, false);
  assert.match(replies[0].content, /kaynak kod paylaşamam/i);
  assert.deepEqual(replies[0].allowedMentions, { parse: [] });
});

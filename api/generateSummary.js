const axios = require('axios');

module.exports = async (req, res) => {
  const { answers, questions } = req.body;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }
  if (!answers || !questions) {
    return res.status(400).json({ error: 'Missing answers or questions' });
  }

  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'Missing OpenAI API key' });

  const prompt = `
Given these food survey questions and answers (0-10 scale), write a playful, judgmental, and brutally honest summary paragraph for the user. 
Be witty, a little insulting, and don't hold back on calling out their weird or boring tastes. 
Reference specific answers or patterns in your summary, and consider every question and answer in your analysis—do not ignore any aspect of the quiz.
Also, include a specific suggestion for what kind of restaurant or cuisine they should try next, based on their unique combination of answers.
Questions: ${questions.join(' | ')}
Answers: ${answers.join(', ')}
Respond ONLY with a valid JSON object: { "summary": "...", "suggestion": "..." }
`;

  try {
    const openaiRes = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.8,
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );
    const text = openaiRes.data.choices[0].message.content;
    console.log('AI response:', text);
    const match = text.match(/{[\s\S]*}/);
    if (!match) {
      return res.status(500).json({ error: 'AI did not return JSON', aiResponse: text });
    }
    const json = JSON.parse(match[0]);
    res.status(200).json(json);
  } catch (err) {
    res.status(500).json({ error: 'AI summary failed', details: err.message });
  }
};
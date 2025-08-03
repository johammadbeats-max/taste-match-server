const axios = require('axios');

module.exports = async (req, res) => {
  const { answers, questions } = req.body;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'Missing OpenAI API key' });

  const prompt = `
Given these food survey questions and answers (0-10 scale), generate a fun, short personality name and a playful summary sentence for the user.
Questions: ${questions.join(' | ')}
Answers: ${answers.join(', ')}
Respond as JSON: { "name": "...", "summary": "..." }
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
    const json = JSON.parse(text.match(/{[\s\S]*}/)[0]);
    res.status(200).json(json);
  } catch (err) {
    res.status(500).json({ error: 'AI summary failed', details: err.message });
  }
};
const axios = require('axios');

module.exports = async (req, res) => {
  const { restaurant, people } = req.body;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }
  if (!restaurant || !people) {
    return res.status(400).json({ error: 'Missing restaurant or people' });
  }

  const prompt = `
Estimate the average price for an appetizer, main course, and one drink at a ${restaurant.categories} restaurant called "${restaurant.name}" in ${restaurant.address || 'the US'}, rated ${restaurant.rating || 'unknown'} stars. 
Return a JSON object: { "appetizer": 12, "main": 22, "drink": 8 }
`;

  try {
    const openaiRes = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 0.3,
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );
    const text = openaiRes.data.choices[0].message.content;
    const match = text.match(/{[\s\S]*}/);
    if (!match) {
      return res.status(500).json({ error: 'AI did not return JSON', aiResponse: text });
    }
    const prices = JSON.parse(match[0]);
    // Calculate totals
    const total = people * (prices.appetizer + prices.main + prices.drink);
    res.status(200).json({ ...prices, total, perPerson: prices.appetizer + prices.main + prices.drink });
  } catch (err) {
    res.status(500).json({ error: 'Price estimation failed', details: err.message });
  }
};
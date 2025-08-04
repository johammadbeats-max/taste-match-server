const axios = require('axios');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const { hostAnswers, guestAnswers, location, coordinates, questions = [] } = req.body;

  if (!hostAnswers || !guestAnswers) {
    return res.status(400).json({ error: 'Missing hostAnswers or guestAnswers' });
  }

  const YELP_API_KEY = process.env.YELP_API_KEY;
  const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  // Combine answers for AI
  const scores = hostAnswers.map((val, i) => (val + guestAnswers[i]) / 2);

  // Use AI to generate search term and categories
  let term = 'food';
  let categories = 'restaurants';

  if (OPENAI_API_KEY && questions.length === scores.length) {
    try {
      const prompt = `
Given these survey questions and average answers (0-10 scale), suggest the best Yelp/Google search term and categories for a restaurant search. 
Respond ONLY with a valid JSON object: { "term": "...", "categories": "..." }

Questions: ${questions.join(' | ')}
Answers: ${scores.join(', ')}
`;

      const openaiRes = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 40,
          temperature: 0.5,
        },
        { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
      );
      const text = openaiRes.data.choices[0].message.content;
      const match = text.match(/{[\s\S]*}/);
      if (match) {
        const ai = JSON.parse(match[0]);
        term = ai.term || term;
        categories = ai.categories || categories;
      }
    } catch (err) {
      console.error('OpenAI API error:', err.message);
    }
  }

  let yelpRestaurants = [];
  let googleRestaurants = [];

  // Fetch from Yelp
  if (YELP_API_KEY) {
    try {
      // Yelp API params
      const yelpParams = {
        term,
        categories,
        sort_by: 'rating',
        limit: 5,
      };
      if (coordinates && coordinates.latitude && coordinates.longitude) {
        yelpParams.latitude = coordinates.latitude;
        yelpParams.longitude = coordinates.longitude;
      } else if (location) {
        yelpParams.location = location;
      } else {
        yelpParams.location = 'New York, NY'; // fallback
      }

      const yelpResponse = await axios.get('https://api.yelp.com/v3/businesses/search', {
        headers: {
          Authorization: `Bearer ${YELP_API_KEY}`
        },
        params: yelpParams,
      });

      yelpRestaurants = yelpResponse.data.businesses.map(b => ({
        name: b.name,
        rating: b.rating,
        address: b.location.display_address.join(', '),
        image_url: b.image_url,
        url: b.url,
        categories: b.categories.map(c => c.title).join(', '),
        source: 'yelp'
      }));
    } catch (err) {
      console.error('Yelp API error:', err.message);
    }
  }

  // Fetch from Google Places
  if (GOOGLE_MAPS_API_KEY) {
    try {
      // Google API params
      let googleQuery = `${term} restaurants`;
      if (location) {
        googleQuery += ` in ${location}`;
      }

      let googleParams = {
        key: GOOGLE_MAPS_API_KEY,
        query: googleQuery,
      };
      if (coordinates && coordinates.latitude && coordinates.longitude) {
        googleParams.location = `${coordinates.latitude},${coordinates.longitude}`;
        googleParams.radius = 5000; // meters, adjust as needed
      }

      const googleResponse = await axios.get(
        'https://maps.googleapis.com/maps/api/place/textsearch/json',
        { params: googleParams }
      );

      googleRestaurants = googleResponse.data.results.slice(0, 5).map(b => ({
        name: b.name,
        rating: b.rating,
        address: b.formatted_address,
        image_url: b.photos && b.photos.length > 0
          ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${b.photos[0].photo_reference}&key=${GOOGLE_MAPS_API_KEY}`
          : null,
        url: `https://www.google.com/maps/place/?q=place_id:${b.place_id}`,
        categories: b.types ? b.types.join(', ') : '',
        source: 'google'
      }));
    } catch (err) {
      console.error('Google Places API error:', err.message);
    }
  }

  // Combine and deduplicate by name+address
  const allRestaurants = [...yelpRestaurants, ...googleRestaurants];
  const seen = new Set();
  const combined = allRestaurants.filter(r => {
    const key = `${r.name}|${r.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (combined.length > 0) {
    return res.status(200).json(combined);
  }

  return res.status(500).json({ error: 'Failed to fetch restaurant recommendations from Yelp and Google.' });
};
const axios = require('axios');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const { hostAnswers, guestAnswers, location = 'New York, NY' } = req.body;

  if (!hostAnswers || !guestAnswers) {
    return res.status(400).json({ error: 'Missing hostAnswers or guestAnswers' });
  }

  const YELP_API_KEY = process.env.YELP_API_KEY;
  const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

  // Combine answers to simulate preference matching (simple average for now)
  const scores = hostAnswers.map((val, i) => (val + guestAnswers[i]) / 2);
  const spicyTolerance = scores[0];
  const adventurousness = scores[7];

  const term = adventurousness > 7 ? 'fusion' : 'food';
  const categories = spicyTolerance > 7 ? 'szechuan,mexican' : 'italian,japanese';

  let yelpRestaurants = [];
  let googleRestaurants = [];

  // Fetch from Yelp
  if (YELP_API_KEY) {
    try {
      const yelpResponse = await axios.get('https://api.yelp.com/v3/businesses/search', {
        headers: {
          Authorization: `Bearer ${YELP_API_KEY}`
        },
        params: {
          location,
          term,
          categories,
          sort_by: 'rating',
          limit: 5
        }
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
      const googleResponse = await axios.get(
        'https://maps.googleapis.com/maps/api/place/textsearch/json',
        {
          params: {
            query: `${term} restaurants in ${location}`,
            key: GOOGLE_MAPS_API_KEY
          }
        }
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
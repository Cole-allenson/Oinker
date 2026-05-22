import { GOOGLE_MAPS_API_KEY } from '../constants/config';

export interface PlaceResult {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  price_level: number | null;
  is_open: boolean | null;
  phone: string | null;
  website: string | null;
}

function parsePlace(place: any): PlaceResult {
  return {
    place_id: place.id || place.name || Math.random().toString(),
    name: place.displayName?.text || 'Unknown',
    address: place.formattedAddress || '',
    lat: place.location?.latitude || 0,
    lng: place.location?.longitude || 0,
    rating: place.rating || null,
    price_level: place.priceLevel ? parseInt(place.priceLevel.replace('PRICE_LEVEL_', '')) || null : null,
    is_open: place.currentOpeningHours?.openNow ?? null,
    phone: place.nationalPhoneNumber || place.internationalPhoneNumber || null,
    website: place.websiteUri || null,
  };
}

export async function searchNearbyRestaurants(
  lat: number,
  lng: number,
  radius: number = 3000,
): Promise<PlaceResult[]> {
  const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.rating,places.priceLevel,places.currentOpeningHours,places.nationalPhoneNumber,places.websiteUri',
    },
    body: JSON.stringify({
      includedPrimaryTypes: ['restaurant'],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius,
        },
      },
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || 'Failed to fetch restaurants');
  }

  return (data.places || []).map(parsePlace);
}

export async function searchRestaurants(
  query: string,
  lat: number,
  lng: number,
): Promise<PlaceResult[]> {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.rating,places.priceLevel,places.currentOpeningHours,places.nationalPhoneNumber,places.websiteUri',
    },
    body: JSON.stringify({
      textQuery: query + ' restaurant',
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 5000,
        },
      },
      maxResultCount: 20,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || 'Failed to search restaurants');
  }

  return (data.places || []).map(parsePlace);
}

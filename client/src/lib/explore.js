const make = (list, tag) =>
  list.map(([name, state, latitude, longitude]) => ({
    id: `${latitude},${longitude}`,
    name,
    state,
    kind: "city",
    country: "India",
    countryCode: "IN",
    district: "",
    subtitle: `${state}, India`,
    latitude,
    longitude,
    tag,
  }));

/** Curated destinations, loaded with live conditions on the Places page. */
export const EXPLORE = [
  { value: "hills", label: "Hill stations", places: make([["Shimla", "Himachal Pradesh", 31.1048, 77.1734], ["Manali", "Himachal Pradesh", 32.2396, 77.1887], ["Darjeeling", "West Bengal", 27.041, 88.2663], ["Ooty", "Tamil Nadu", 11.4102, 76.695], ["Mussoorie", "Uttarakhand", 30.4598, 78.0644]], "hills") },
  { value: "coast", label: "Coastal", places: make([["Panaji", "Goa", 15.4909, 73.8278], ["Kochi", "Kerala", 9.9312, 76.2673], ["Puri", "Odisha", 19.8135, 85.8312], ["Visakhapatnam", "Andhra Pradesh", 17.6868, 83.2185], ["Mangaluru", "Karnataka", 12.9141, 74.856]], "coast") },
  { value: "heritage", label: "Heritage & pilgrimage", places: make([["Varanasi", "Uttar Pradesh", 25.3176, 82.9739], ["Amritsar", "Punjab", 31.634, 74.8723], ["Rishikesh", "Uttarakhand", 30.0869, 78.2676], ["Udaipur", "Rajasthan", 24.5854, 73.7125], ["Madurai", "Tamil Nadu", 9.9252, 78.1198]], "heritage") },
  { value: "metros", label: "Metros", places: make([["Delhi", "Delhi", 28.6139, 77.209], ["Mumbai", "Maharashtra", 19.076, 72.8777], ["Bengaluru", "Karnataka", 12.9716, 77.5946], ["Kolkata", "West Bengal", 22.5726, 88.3639], ["Chennai", "Tamil Nadu", 13.0827, 80.2707]], "metros") },
];

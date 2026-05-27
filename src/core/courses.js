// Static course database. Each entry has location (lat/lon/tz/name),
// greenSpeed (typical course value), notes, pars per hole, and tees with
// yardages per tee colour.

export const COURSES = {
  RCGC: {
    location: { lat: 22.5337, lon: 88.3491, tz: "Asia/Kolkata", name: "Royal Calcutta GC" },
    greenSpeed: "Medium-fast (~10 stimp)",
    notes: "Historic parkland. Greens read true. Watch the cross-bunkers on hole 4.",
    pars: [4, 3, 4, 5, 4, 4, 4, 4, 4, 4, 4, 4, 3, 4, 5, 4, 4, 4],
    tees: {
      Blue: [359, 161, 442, 570, 410, 425, 421, 401, 429, 439, 451, 394, 233, 426, 503, 354, 382, 437],
      White: [350, 150, 388, 521, 396, 420, 388, 368, 396, 426, 422, 341, 196, 404, 494, 347, 367, 429],
      Yellow: [309, 142, 368, 463, 382, 377, 333, 352, 316, 371, 359, 326, 157, 348, 409, 329, 357, 367],
      Red: [305, 137, 332, 451, 352, 330, 299, 326, 314, 367, 351, 283, 126, 323, 403, 327, 347, 363],
    },
    // USGA Course Rating + Slope per tee. Used to convert Handicap Index ↔ Course Handicap.
    // Yellow/Red pending — fill in when known.
    ratings: {
      Blue:  { cr: 75.3, slope: 137 },
      White: { cr: 73.3, slope: 131 },
    },
  },
  Tolly: {
    location: { lat: 22.5113, lon: 88.3464, tz: "Asia/Kolkata", name: "Tollygunge Club" },
    greenSpeed: "—",
    notes: "Scorecard pending.",
    pars: null,
    tees: null,
  },
};

export const DEFAULT_COURSE_LOCATION = { lat: 22.5337, lon: 88.3491, tz: "Asia/Kolkata", name: "Kolkata" };

export function locationFor(courseKey) {
  if (courseKey && COURSES[courseKey] && COURSES[courseKey].location) return COURSES[courseKey].location;
  return DEFAULT_COURSE_LOCATION;
}

export const BAD_QUALITIES = ["Top", "Duff", "Slice", "Hook"];

export const ALL_CLUBS = [
  "Driver", "Mini Driver",
  "2 Wood", "3 Wood", "4 Wood", "5 Wood", "7 Wood", "9 Wood",
  "1 Hybrid", "2 Hybrid", "3 Hybrid", "4 Hybrid", "5 Hybrid", "6 Hybrid", "7 Hybrid",
  "1 Iron", "2 Iron", "3 Iron", "4 Iron", "5 Iron", "6 Iron", "7 Iron", "8 Iron", "9 Iron",
  "Pitching Wedge", "Gap Wedge", "Sand Wedge", "Lob Wedge",
  "Chipper", "Putter",
];

export const DEFAULT_CLUBS = ["Driver", "3 Wood", "4 Hybrid", "6 Iron", "7 Iron", "8 Iron", "9 Iron", "Pitching Wedge", "Sand Wedge", "Lob Wedge", "Putter"];

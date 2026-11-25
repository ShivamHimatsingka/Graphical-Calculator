// Maths word problems for comparing local models. Each lists the function(s) a correct answer must graph.
// "expect" functions are compared numerically against the rows the model returns (any row may match).
module.exports = [
  { q: 'A farmer has 100 m of fence and wants the largest rectangular area. Graph the area against the width.', expect: [(x) => x * (50 - x)], xs: [10, 20, 30, 40] },
  { q: 'A taxi charges a $3.50 pickup fee plus $2.25 per kilometre. Graph the cost against the distance.', expect: [(x) => 3.5 + 2.25 * x], xs: [1, 4, 10] },
  { q: 'A ball is thrown straight up at 20 m/s from a height of 2 m. Graph its height over time (g = 9.8 m/s^2).', expect: [(x) => -4.9 * x * x + 20 * x + 2], xs: [0.5, 1, 2, 3] },
  { q: 'A bacteria culture starts at 500 cells and doubles every 3 hours. Graph the population over time.', expect: [(x) => 500 * Math.pow(2, x / 3)], xs: [0, 3, 6, 9] },
  { q: 'A car worth $30,000 loses 15% of its value each year. Graph its value over the years.', expect: [(x) => 30000 * Math.pow(0.85, x)], xs: [0, 1, 3, 5] },
  { q: 'A shop sells mugs for $8 each. Fixed costs are $200 and each mug costs $3 to make. Graph revenue and cost to find the break-even point.', expect: [(x) => 8 * x, (x) => 200 + 3 * x], xs: [10, 40, 80], all: true },
  { q: 'Phone plan A costs $20 plus $0.10 per minute. Plan B costs $0.25 per minute with no fee. Graph both plans.', expect: [(x) => 20 + 0.1 * x, (x) => 0.25 * x], xs: [10, 100, 200], all: true },
  { q: 'Graph the parabola with vertex (3, -2) that passes through the point (5, 6).', expect: [(x) => 2 * (x - 3) * (x - 3) - 2], xs: [0, 3, 4, 7] },
  { q: 'Graph f(x) = x^3 - 3x together with its derivative.', expect: [(x) => x ** 3 - 3 * x, (x) => 3 * x * x - 3], xs: [-2, -0.5, 1, 2.5], all: true },
  { q: 'Tide height is a sine wave with mean level 3 m, amplitude 1.5 m and a period of 12 hours. Graph the height over time.', expect: [(x) => 3 + 1.5 * Math.sin(2 * Math.PI * x / 12)], xs: [0, 2, 5, 9] },
  { q: 'A rectangle has a perimeter of 60 cm. Graph its area as a function of its width.', expect: [(x) => x * (30 - x)], xs: [5, 10, 15, 25] },
  { q: 'Graph the area of a circle as a function of its radius.', expect: [(x) => Math.PI * x * x], xs: [1, 2, 5] },
  { q: '$2000 is invested at 5% interest compounded annually. Graph the balance over time.', expect: [(x) => 2000 * Math.pow(1.05, x)], xs: [0, 5, 10, 20] },
  { q: 'y varies inversely with x, and y = 6 when x = 4. Graph the relationship.', expect: [(x) => 24 / x], xs: [1, 2, 6, 12] },
  { q: 'A cyclist starts 5 km from home and rides directly away at 18 km/h. Graph her distance from home over time in hours.', expect: [(x) => 5 + 18 * x], xs: [0, 1, 2.5] }
  ,
  // ---- harder, multi-step problems ----
  { q: 'Car A leaves a city at 60 km/h. Car B leaves the same city 1 hour later at 80 km/h on the same road. Graph how far each car is from the city, with x as hours since car A left.', expect: [(x) => 60 * x, (x) => 80 * (x - 1)], xs: [1.5, 2, 4, 6], all: true },
  { q: 'A farmer has 120 m of fence and uses a straight river as the fourth side of a rectangular field. Graph the field area against the width of the sides that touch the river.', expect: [(x) => x * (120 - 2 * x)], xs: [10, 20, 30, 50] },
  { q: 'An open-top box is made from a 12 cm by 12 cm sheet by cutting a square of side x from each corner and folding up the sides. Graph the volume against x.', expect: [(x) => x * (12 - 2 * x) * (12 - 2 * x)], xs: [1, 2, 3, 5] },
  { q: 'A closed cylindrical can must hold exactly 1000 cm^3. Graph its total surface area against its radius.', expect: [(x) => 2 * Math.PI * x * x + 2000 / x], xs: [2, 4, 5.5, 10] },
  { q: 'A factory has fixed costs of $5000 and pays $12 to make each unit. Graph the average cost per unit against the number of units made.', expect: [(x) => (5000 + 12 * x) / x], xs: [10, 100, 500, 1000] },
  { q: 'A 200 mg dose of a drug has a half-life of 6 hours. Graph the amount left in the blood over time in hours.', expect: [(x) => 200 * Math.pow(0.5, x / 6)], xs: [0, 6, 12, 20] },
  { q: 'A town of 10,000 people grows 4% per year, compounded continuously. Graph the population over the years.', expect: [(x) => 10000 * Math.exp(0.04 * x)], xs: [0, 5, 10, 25] },
  { q: 'A 100 W lamp radiates equally in all directions. Graph the light intensity (power per unit area) against the distance from the lamp.', expect: [(x) => 100 / (4 * Math.PI * x * x)], xs: [1, 2, 5, 10] },
  { q: 'A Ferris wheel has radius 10 m, its centre 12 m above the ground, and turns once every 4 minutes. A rider boards at the lowest point at time 0. Graph the rider height over time in minutes.', expect: [(x) => 12 - 10 * Math.cos(2 * Math.PI * x / 4)], xs: [0, 1, 2, 3.5] }
];

/** Steam client colors, the app is dark like Steam itself. */
export const colors = {
  background: '#171d25',
  surface: '#1f2732',
  surfaceRaised: '#2a3442',
  // steam's header and composer bars
  bar: '#171a21',
  // text inputs
  field: '#32353c',
  border: '#2e3947',
  text: '#dcdedf',
  bright: '#ffffff',
  muted: '#8b97a5',
  accent: '#1a9fff',
  // behind accent text: pills and their buttons
  accentBackground: 'rgba(26, 159, 255, 0.15)',
  // steam's colors for names and avatar frames of online and offline friends
  online: '#57cbde',
  offline: '#6a7480',
  speaking: '#6fd14b',
  accept: '#3fb950',
  danger: '#e0473d',
  warning: '#e0b43d',
  // steam's discount badge
  discount: '#beee11',
  discountBackground: '#4c6b22',
  // steam's colors for positive, mixed and negative reviews
  positive: '#66c0f4',
  mixed: '#b9a074',
  negative: '#a34c25',
};

export const gradients = {
  screen: 'linear-gradient(180deg, #1b2838 0%, #171d25 45%, #11161d 100%)',
  // steam's sign in button
  primary: 'linear-gradient(90deg, #06bfff 0%, #2d73ff 100%)',
  // steam's play button
  accept: 'linear-gradient(90deg, #70d61d 0%, #01a75b 100%)',
  danger: 'linear-gradient(90deg, #ff5a4e 0%, #c9302c 100%)',
  dock: 'linear-gradient(180deg, #2a3442 0%, #1f2732 100%)',
};

/** How long pictures take to fade in once loaded, rather than popping in. */
export const imageFadeMs = 200;

/** Half the space between grid cards, around each card and on both ends of its row. */
export const gridGutter = 6;

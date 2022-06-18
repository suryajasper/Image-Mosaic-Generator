
import getUid from './auth';
// import colors from '../spotify_accounts/out_algebrainer.json';
// import colors from './data/avg.json';

let colors = [];

async function loadColors() {

  let uid = await getUid();

  let res = await fetch(`http://suryajasper.com:8814/get_images?id=${uid}`);

  let body = await res.json();

  colors = body.colors.map((color, i) => {
    return {
      color,
      img: `data:image/jpg;base64,${body.imgs[i]}`,
      id: i,
    };
  });

}

function closestColors(color, n=3) {
  
  let mins = [];

  for (let i = 0; i < n; i++) mins.push({i: 0, d: 1e99});

  for (let i = 0; i < colors.length; i++) {
    let [r1, g1, b1, _] = colors[i].color;
    let [r2, g2, b2] = color;
    
    const d = ((r2-r1)*0.30)**2 + ((g2-g1)*0.59)**2 + ((b2-b1)*0.11)**2;

    for (let j = 0; j < n; j++) {
      if (d < mins[j].d) {
        mins[j] = {i, d};
        break;
      }
    }
  }

  return mins;
}

function hexToRGB(color) {
  const r = parseInt(color.substr(1,2), 16)
  const g = parseInt(color.substr(3,2), 16)
  const b = parseInt(color.substr(5,2), 16)
  return [r, g, b];
}

function rgbaObjToCss(obj, changes) {
  const {r, g, b, a} = Object.assign(obj, changes);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function rgbObjToArr(obj) {
  const {r, g, b} = obj;
  return [r, g, b];
}

function rgbArrToObj(arr) {
  let [r, g, b, a] = arr;
  a = a || 1;
  return {r, g, b, a};
}

export { colors, loadColors, closestColors, hexToRGB, rgbaObjToCss, rgbObjToArr, rgbArrToObj }

import colors from '../out_caroltuu.json';

console.log('colors', colors);

function closestColor(color) {
  let minD = 1e99;
  let minI = 0;

  for (let i = 0; i < colors.length; i++) {
    let [r1, g1, b1, _] = colors[i].color;
    let [r2, g2, b2] = color;
    
    const d = ((r2-r1)*0.30)**2 + ((g2-g1)*0.59)**2 + ((b2-b1)*0.11)**2;
    if (d < minD) {
      minD = d;
      minI = i;
    }
  }

  return minI;
}

function hexToRGB(color) {
  const r = parseInt(color.substr(1,2), 16)
  const g = parseInt(color.substr(3,2), 16)
  const b = parseInt(color.substr(5,2), 16)
  return [r, g, b];
}

function rgbObjToArr(obj) {
  const {r, g, b} = obj;
  return [r, g, b];
}

export { colors, closestColor, hexToRGB, rgbObjToArr }
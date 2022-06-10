
function msToTime(s) {
  const ms = s % 1000;
  s = (s - ms) / 1000;

  const secs = s % 60;
  s = (s - secs) / 60;

  if (s >= 60) {
    const mins = s % 60;
    s = (s - mins) / 60;
    return `${s}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else return `${s}:${secs.toString().padStart(2, '0')}`;

}

function arr2D(arr1D, rows) {
  const cols = arr1D.length / rows;
  const newArr = [];

  for (let i = 0; i < rows; i++) {
    newArr.push(arr1D.slice(i * cols, i * cols + cols));
  }

  return newArr;
}

function init2D(rows, cols, val=0) {
  let arr = [];
  for (let r = 0; r < rows; r++) {
    let row = [];
    for (let c = 0; c < cols; c++) row.push(val);
    arr.push(row);
  }
  return arr;
}

function splitArray(arr, size) {
  let newArr = [];

  while (arr.length > 0)
    newArr.push(arr.splice(0, size));
  
  return newArr;
}

function numToPercent(num) {
  return `${Math.round(num*100*100)/100}%`;
}

function randArr(array, weighted=true) {

  if (Array.isArray(array)) {

    let ind = 0;

    if (weighted) {
      let weights = array.map(el => 1 / el.d);
      let sum = weights.reduce((a, b) => a + b);
      weights = weights.map(w => w / sum);
      
      let r = Math.random();
      
      for (let i = 1; i < weights.length; i++) {
        weights[i] = weights[i] + weights[i-1];
        if (r >= weights[i-1] && r < weights[i]) {
          ind = i;
          break;
        }
      }
    }
    else
      ind = Math.floor(Math.random() * array.length);

    return array[ind];
  }
  else 
    return array;

}

module.exports = { msToTime, arr2D, init2D, splitArray, numToPercent, randArr };
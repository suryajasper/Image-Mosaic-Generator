
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

module.exports = { msToTime, arr2D, init2D };
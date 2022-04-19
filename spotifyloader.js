const unirest = require('unirest');
const fs = require('fs');
const { getAverageColor } = require('fast-average-color-node');
const { rgba } = require('jimp');

const id = '6PeXx4RdTsQe7ZeQKFLefY';
const TOKEN = 'BQDK-k685vzERIcxVEQj7awuZXF3yvjHClZQuhHFQUyJ59fRmoqvoGTRJiDLmX871WSeBpqKDhqVTvbiPcJN_VX36bZIikUDLQRNUMJaHElUhdi70A8-Rknl8ZTqArZS1BJV75KBwGyuu0ftLmvYV9kR413bWg';

function getPlaylist(offset) {
  return new Promise((resolve, reject) => {
    unirest
      .get(`https://api.spotify.com/v1/playlists/${id}/tracks`)
      .headers({
        "Accept": 'application/json',
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TOKEN}`,
      })
      .query({
        market: 'ES',
        fields: "items(track(album(name,images)))",
        limit: 100,
        offset,
      })
      .then(res => {
        console.log(res.body);
        const images = {};
        res.body.items.map(obj => {
          if (obj.track && obj.track.album && obj.track.album.images.length > 0)
            return obj.track.album;
          return null;
        }).forEach(album => {
          if (album)
            images[album.name] = album.images[2].url;
        });
        resolve(images);
      })
      .catch(reject)
  })
}

let offsets = [0,];
Promise.all(offsets.map(getPlaylist)).then(res => {
  const final = res.reduce((prev, curr) => Object.assign(prev, curr), {});
  console.log(final);
  fs.writeFile('./out.json', JSON.stringify(Object.values(final)), (err) => {
    if (err) console.error(err);

    fs.readFile('./out2.json', (err, data) => {
      if (err) console.error(err);
      const existingColors = JSON.parse(data);
    
      fs.readFile('./out.json', (err, data) => {
        if (err) console.error(err);
        const albums = JSON.parse(data);
    
        Promise.all(albums.map(getAverageColor)).then(res => {
          console.log(res.length, albums.length);
          const colors = albums.map((img, i) => {
            return {
              img,
              color: res[i].value,
            }
          });

          fs.writeFile('./out2.json', JSON.stringify(colors.concat(existingColors)), console.log);
        })
      })
    })

  });
})

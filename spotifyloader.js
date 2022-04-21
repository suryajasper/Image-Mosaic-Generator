const unirest = require('unirest');
const fs = require('fs');
const { getAverageColor } = require('fast-average-color-node');
const { rgba } = require('jimp');
const { getAvailableNumberOfCores } = require('terser-webpack-plugin');

const userId = process.argv[2];
const TOKEN = 'BQBWxgmRjeunQwNEFrrGGTfxteeozwmoWGZ_oqyAwvPq3MsauQ-5b1Azz9DLl5aGhjfzYxYyWfD7xNlinjVn4KuUwmjr5-Qqdc9RwOVnkwFNaSrRCyjFvd83XeCBN4ZibxkDye9_2JUWFyCJrHzq4RIwSHWSrPUw';

function getPlaylist(id, offset) {
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

function getUserPlaylists() {
  return new Promise((resolve, reject) => {
    unirest
      .get(`https://api.spotify.com/v1/users/${userId}/playlists`)
      .headers({
        "Accept": 'application/json',
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TOKEN}`,
      })
      .then(res => {
        const playlists = res.body.items
          .filter(playlist => 
            playlist.owner.id === userId
          )
          .map(playlist => {
            return {
              id: playlist.id,
              name: playlist.name,
              count: playlist.tracks.total,
            };
          });
        resolve(playlists);
      })
      .catch(reject)
  })
}

async function getAlbums() {

  const playlists = await getUserPlaylists();

  let albums = {};

  for (let playlist of playlists) {
    console.log(`--START_PARSE playlist "${playlist.name}"`);
    for (let offset = 0; offset < playlist.count; offset += 100) {

      const plInfo = await getPlaylist(playlist.id, offset);
      albums = Object.assign(albums, plInfo);

      console.log(`${offset+1}-${offset+100}/${playlist.count} = ${(offset+100)/playlist.count*100}%`);

    }
    console.log(`--END_PARSE playlist "${playlist.name}"`);
  }

  const albumImgs = Object.values(albums);
  
  console.log('--START_AVERAGE_COLOR');

  const averageColors = await Promise.all(albumImgs.map(getAverageColor));

  console.log('--END_AVERAGE_COLOR')

  const colors = albumImgs.map((img, i) => {
    return {
      img,
      color: averageColors[i].value,
    }
  });

  fs.writeFileSync(`./out_${userId}.json`, JSON.stringify(colors), err => {
    if (err) console.error(err);
  });

}

//getUserPlaylists().then(console.log);
getAlbums().then(console.log);

/*
Promise.all(offsets.map(getPlaylist)).then(async res => {

  const albums = Object.values(
    res.reduce(
      (prev, curr) => Object.assign(prev, curr), {}
    )
  );

  // await fs.writeFile('./out.json', JSON.stringify(Object.values(final)));
  
  // const existingColors = JSON.parse(await fs.readFile('./out2.json'));
    
  // const albums = await JSON.parse(await fs.readFile('./out.json'));
    
  const res = await Promise.all(albums.map(getAverageColor));

  console.log('PLAYLIST', res.length, albums.length);

  const colors = albums.map((img, i) => {
    return {
      img,
      color: res[i].value,
    }
  });

  await fs.writeFile(`./out_${userId}.json`, JSON.stringify(colors.concat(existingColors)));
})
*/
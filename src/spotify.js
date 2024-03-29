
import { spotify } from './credentials.json';
import Cookies from './cookies';
import { FastAverageColor } from 'fast-average-color'

async function getToken() {

  if (Cookies.get('spotify_token')) return Cookies.get('spotify_token');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + btoa(`${spotify.client_id}:${spotify.client_secret}`),
    },
    method: "POST",
    body: "grant_type=client_credentials"
  });

  const data = await res.json();

  Cookies.set('spotify_token', data['access_token'], data['expires_in'] / 3600);

  return data['access_token'];

}

async function getPlaylist(id, offset) {

  const TOKEN = await getToken();

  const res = await fetch(`https://api.spotify.com/v1/playlists/${id}/tracks?` + 
    new URLSearchParams({
      market: 'ES',
      fields: "items(track(album(name,images)))",
      limit: 100,
      offset,
    })
  , {
    headers: {
      "Accept": 'application/json',
      "Content-Type": "application/json",
      "Authorization": `Bearer ${TOKEN}`,
    },
    method: "GET",
  });

  const data = await res.json();
  
  const images = {};

  if (!data.items) return undefined;

  data.items.map(obj => {
    if (obj.track && obj.track.album && obj.track.album.images.length > 0)
      return obj.track.album;
    return null;
  }).forEach(album => {
    if (album) 
      images[album.name] = album.images[2].url;
  });
  
  return images;

}

async function getUserPlaylists(userId) {

  const TOKEN = await getToken();

  const res = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
    headers: {
      "Accept": 'application/json',
      "Content-Type": "application/json",
      "Authorization": `Bearer ${TOKEN}`,
    },
    method: "GET",
  });

  const data = await res.json();
  if (!data.items) return undefined;
  
  const playlists = data.items
    .filter(playlist => 
      //playlist.owner.id === userId &&
      playlist.images.length > 0
    )
    .map(playlist => {
      return {
        id: playlist.id,
        name: playlist.name,
        count: playlist.tracks.total,
        img: playlist.images[0].url,
      };
    });
  
  return playlists;
}


function makeid(length) {
  var result           = '';
  var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

async function getAlbums(playlists) {

  playlists = playlists || await getUserPlaylists();

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

  const colors = Object.keys(albums).map(name => {
    return {
      name: name.replace(/[\u{0080}-\u{10FFFF}]/gu, makeid(1)) + 'sa', // replace non ascii with ascii
      img: albums[name],
    }
  });

  return colors;

}

export { getPlaylist, getUserPlaylists, getAlbums };
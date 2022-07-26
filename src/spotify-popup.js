import m from 'mithril';

import './css/spotify.scss';

import { getPlaylist, getUserPlaylists, getAlbums } from './spotify';
import { initArr } from './utils';
import { getUid } from './auth';

export default class SpotifyPopup {
  constructor(vnode) {
    this.callback = vnode.attrs.callback;
    this.playlists = [];
    this.selected = [];
  }

  oninit(vnode) {
    getUserPlaylists().then(playlists => {
      this.playlists = playlists;
      this.selected = initArr([playlists.length], false);

      m.redraw();
    });
  }

  isAllSelected() {
    if (this.selected.length === 0) return false;

    let totalSelected = this.selected.reduce((a, b) => a+b);
    let totalPlaylists = this.playlists.length;

    return totalSelected === totalPlaylists;
  }

  async uploadAlbums() {
    const uid = await getUid();
    const playlists = this.playlists.filter((_, i) => this.selected[i]);
    const albums = await getAlbums(playlists);

    const formData = new FormData();
    formData.append('id', uid);
    formData.append('upload_type', 'url');
    formData.append('imgs', JSON.stringify(albums));

    await fetch('http://suryajasper.com:8814/upload_images', {
      method: 'POST',
      body: formData,
    });

    this.callback('success');
  }

  view(vnode) {
    return m('div.spotify-popup', {style: { display: vnode.attrs.active ? "flex": "none" }}, [
      m('div.playlists-container', this.playlists.map((playlist, i) =>
        
        m('div.playlist-view', {
          onclick: e => {
            this.selected[i] = !this.selected[i];

            e.stopPropagation();
          }
        }, [
          m('input.playlist-select', {
            type: "checkbox",
            checked: this.selected[i],
          }),

          m('img.playlist-cover', {src: playlist.img}),

          m('span.playlist-title', playlist.name),

          m('span', playlist.count),
        ]),

      )),

      m('button.select-all', { onclick: e => {
        let bool = !this.isAllSelected();
        for (let i = 0; i < this.selected.length; i++)
          this.selected[i] = bool;
      } }, 
        this.isAllSelected() ? 'Deselect All' : 'Select All'
      ),

      m('button', { onclick: () => this.callback('cancelled') }, "Cancel"),

      m('button', { onclick: this.uploadAlbums.bind(this) }, "Confirm"),

    ]);
  }
}
import m from 'mithril';

import './css/spotify.scss';

import { getPlaylist, getUserPlaylists, getAlbums } from './spotify';
import { initArr } from './utils';

export default class SpotifyPopup {
  constructor(vnode) {
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

  view(vnode) {
    return m('div.spotify-popup', [
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

    ]);
  }
}
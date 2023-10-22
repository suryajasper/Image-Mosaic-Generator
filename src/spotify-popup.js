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
    this.loading = false;
  }

  refresh() {
    if (!this.profileUrl) return;

    window.localStorage.setItem('spotifyProfileUrl', this.profileUrl);

    const userId = this.profileUrl.split('user/')[1].split('?')[0];

    getUserPlaylists(userId).then(playlists => {
      this.playlists = playlists;
      this.selected = initArr([playlists.length], false);

      m.redraw();
    });
  }

  oninit(vnode) {
    this.profileUrl = window.localStorage.getItem('spotifyProfileUrl') || '';

    this.refresh();
  }

  isAllSelected() {
    if (this.selected.length === 0) return false;

    let totalSelected = this.selected.reduce((a, b) => a+b);
    let totalPlaylists = this.playlists.length;

    return totalSelected === totalPlaylists;
  }

  async uploadAlbums() {
    this.loading = true;
    
    const uid = await getUid();
    const playlists = this.playlists.filter((_, i) => this.selected[i]);
    const albums = await getAlbums(playlists);

    const formData = new FormData();
    formData.append('id', uid);
    formData.append('upload_type', 'url');
    formData.append('imgs', JSON.stringify(albums));

    m.redraw();

    await fetch('http://localhost:8814/upload_images', {
      method: 'POST',
      body: formData,
    });

    console.log('done');

    this.loading = false;

    this.callback('success');
  }

  view(vnode) {
    return m('div.spotify-popup', {
      style: { display: vnode.attrs.active ? "flex": "none" },
    }, [
      m('div.spotify-profile-input-section.flex-row', [
        m('input', {
          type: 'text',
          placeholder: 'Spotify profile link',

          oninput: e => {
            this.profileUrl = e.target.value;
          },
          onkeypress: e => {
            if (e.key === 'Enter')
              this.refresh();
          }
        }),
        m('button', { onclick: this.refresh.bind(this), }, 'Load')
      ]),

      m('div.playlists-container', this.playlists.map((playlist, i) =>
        
        m('div', {
          className: `playlist-view ${this.selected[i] ? 'selected' : ''}`,
          onclick: e => {
            this.selected[i] = !this.selected[i];

            e.stopPropagation();
          }
        }, [
          /*m('input.playlist-select', {
            type: "checkbox",
            checked: this.selected[i],
          }),*/

          m('img.playlist-cover', {src: playlist.img}),

          m('span.playlist-title', playlist.name),

          m('span', playlist.count),
        ]),

      )),

      m('div.flex-row', [

        m('button.select-all', { 
          onclick: e => {
            let bool = !this.isAllSelected();
            for (let i = 0; i < this.selected.length; i++)
              this.selected[i] = bool;
          },
          disabled: this.selected.length <= 1,
        }, 
          this.isAllSelected() ? 'Deselect All' : 'Select All'
        ),
  
        m('button', { 
          disabled: (this.selected.length === 0) || !this.selected.reduce((a, b) => a || b),
          onclick: this.uploadAlbums.bind(this),
        }, "Confirm"),
        
        m('button', {
          onclick: () => this.callback('cancelled'),
        }, "Cancel"),
        
      ]),

      m('div.mosaic-overlay', {
        className: this.loading ? 'loading' : '',
        style: {
          display: this.loading ? 'flex' : 'none',
        },
      }, [
        m('div.loader'),
      ]),


    ]);
  }
}
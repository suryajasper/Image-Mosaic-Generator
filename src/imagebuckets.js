import m from 'mithril';
import { getUid } from './auth';
import { getAlbums } from './spotify';
import { rgbToHsv } from './color';

import ImageUpload from './imageupload';
import IconButton from './icon-button';
import SpotifyPopup from './spotify-popup';

import './css/mosaic.scss';

import { randomStr, ParamParser, base64ImgHeader } from './utils';

export default class ImageBuckets {

  constructor(vnode) {
    this.images = [];
    this.hideUpload = true;
    this.hideSpotify = true;
    this.mode = 'images';

    this.resetSelection();
  }

  resetSelection() {
    this.selection = {
      active: false,
      mode: 'select',
      lastSelection: 0,
      selected: [],
    }
  }

  reloadImages() {
    this.hideUpload = true;

    getUid().then(uid => {
      
      m.request({
        method: 'GET',
        url: `http://localhost:8814/get_images?id=${uid}`
      })
        .then(res => {
          let imgs = res.imgs.map(base64ImgHeader);
          let hsvColors = res.colors.map(rgbToHsv);

          if (imgs.length !== hsvColors.length)
            this.images = imgs;
          else {
            let combined = hsvColors.map(({h, s, v}, i) => ({ key: h, img: imgs[i] }));
            combined.sort((a, b) => a.key - b.key);
            this.images = combined.map(item => item.img);
          }

          this.selection.selected = this.images.map(_ => false);
          m.redraw();
        })

    })
  }

  oninit(vnode) {
    this.reloadImages();
  }

  view(vnode) {
    return [

      m(SpotifyPopup, {
        active: !this.hideSpotify,
        callback: status => {
          if (status === 'success')
            this.reloadImages();
          this.hideSpotify = true;
        }
      }),

      m(ImageUpload, { 
        hidden: this.hideUpload, 
        startUpload: () => { this.hideUpload = false; },
        success: this.reloadImages.bind(this),
      }),

      m('input', { 
        id: "mosaicBaseIn", 
        type: "file", 
        accept: "image/jpeg",
        style: { visibility: 'hidden' },  
        onchange: e => {

          getUid().then(uid => {

            let formdata = new FormData();
            formdata.append('mosaicImg', e.target.files[0]);
            formdata.append('uid', uid);
  
            let xhr = new XMLHttpRequest();
            xhr.open("POST", "http://localhost:8814/upload_mosaic_img", true);
            xhr.onload = () => {

              const fr = new FileReader();
              fr.readAsDataURL(e.target.files[0]);
              fr.addEventListener('load', fe => {

                let paramStr = ParamParser.encode(85, 3, 0.2);
                m.route.set(`/mosaic/${this.mode}/${uid}/${randomStr(6)}/${paramStr}`);
                
              })

            }
            xhr.send(formdata);

          })
          
        }
      }),

      m('div.header', { style: { display: this.selection.active ? 'block' : 'none' }, }, [
        m('p', `${this.selection.selected.filter(el => el).length} Images Selected (Shift+click to select in range)`),
      ]),
      
      m('div.tool-group', [
        m(IconButton, {
          icon: 'gear', 
          title: 'Clear Selection', 
          hidden: !this.selection.active,
          onclick: () => {
            this.resetSelection();
          }
        }),
        m(IconButton, {
          icon: 'trash', 
          title: 'Remove Images', 
          hidden: !this.selection.active,
          onclick: async () => {
            
            let uid = await getUid();

            let selectedImgs = this.selection.selected
              .map((selected, i) => selected ? i : -1)
              .filter(i => i >= 0);

            await m.request({
              method: 'POST',
              url: `http://localhost:8814/remove_imgs`,
              body: {
                id: uid,
                selected: selectedImgs,
              }
            });
            
            m.route.set('/');

          }
        }),
        m(IconButton, {
          icon: 'upload',
          title: 'Upload More Images', 
          hidden: this.selection.active,
          onclick: () => { document.querySelector('#csvIn').click() },
        }),
        m(IconButton, {
          icon: 'spotify',
          title: 'Load Album Covers from Spotify', 
          onclick: () => { this.hideSpotify = false; },
        }),
        m(IconButton, {
          icon: 'build',
          title: 'Generate Mosaic', 
          onclick: () => { this.mode = 'images'; document.querySelector('#mosaicBaseIn').click(); },
        }),
      ]),

      m('div', { class: `img-grid ${this.selection.active ? 'selectmode' : ''}` },

        this.images.map((img, i) => 
          m('img', {
            src: img,
            class: `${this.selection.selected[i] ? 'selected' : ''}`,

            onclick: e => {

              e.preventDefault();

              const s = this.selection;
              
              s.active = true;

              if (s.selected[i]) {
                s.selected[i] = false;
                s.mode = 'deselect'
              } else {
                s.selected[i] = true;
                s.mode = 'select';
              }

              if (e.shiftKey) {
                let [min, max] = [Math.min(s.lastSelection, i), Math.max(s.lastSelection, i)];

                for (let j = min; j <= max; j++) {
                  s.selected[j] = s.mode === 'select';
                }
              }

              s.lastSelection = i;

              if (this.selection.selected.filter(el => el).length === 0)
                this.resetSelection();

            }
          })
        ),

      ),

    ];
  }

}
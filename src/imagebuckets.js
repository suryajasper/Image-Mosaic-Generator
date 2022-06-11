import m from 'mithril';
import getUid from './auth';

import ImageUpload from './imageupload';
import IconButton from './icon-button';

import './css/imagebuckets.scss';
import Mosaic from './mosaic';
import Cookies from './cookies';
import Main from '.';

export default class ImageBuckets {

  constructor(vnode) {
    this.images = [];

    this.hideUpload = true;

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
        url: `http://127.0.0.1:8814/get_images?id=${uid}`
      })
        .then(res => {
          this.images = res.imgs.map(img => `data:image/jpg;base64,${img}`);
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

      m(ImageUpload, { 
        hidden: this.hideUpload, 
        startUpload: () => { this.hideUpload = false; },
        success: this.reloadImages.bind(this),
      }),

      m('div.header', { style: { display: this.selection.active ? 'block' : 'none' }, }, [
        m('p', `${this.selection.selected.filter(el => el).length} Images Selected`),
      ]),
      
      m('div.tool-group', [
        m(IconButton, {
          icon: 'gear', 
          title: 'Clear Selection', 
          onclick: () => {
            this.resetSelection();
          }
        }),
        m(IconButton, {
          icon: 'trash', 
          title: 'Remove Images', 
          onclick: async () => {
            
            let uid = await getUid();

            await m.request({
              method: 'POST',
              url: `http://127.0.0.1:8814/remove_imgs`,
              body: {
                id: uid,
              }
            });

            Cookies.erase('uid');
            m.mount(document.body, Main);

          }
        }),
        m(IconButton, {
          icon: 'upload',
          title: 'Upload More Images', 
          onclick: () => {
            document.querySelector('#csvIn').click();
          }
        }),
        m(IconButton, {
          icon: 'build',
          title: 'Generate Mosaic', 
          onclick: () => {
            m.mount(document.body, Mosaic);
          }
        }),
        m(IconButton, {
          icon: 'exit',
          title: 'Log Out', 
          onclick: () => {
            Cookies.erase('uid');
            m.mount(document.body, Main);
          }
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
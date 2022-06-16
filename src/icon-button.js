import m from 'mithril';

import { icons } from './icons';

import './css/icon-button.css';

const IconButton = {
  view(vnode) {
    return m('div', { 
      class: 'tool-container', 
      style: { display: vnode.attrs.hidden ? 'none' : 'flex' },
      onclick: e => { vnode.attrs.onclick(e); } 
    }, 
      m('div', { class: 'tool' }, icons[vnode.attrs.icon]),
      m('div', { class: 'tool-title' }, vnode.attrs.title),
    );
  }
};

export default IconButton;
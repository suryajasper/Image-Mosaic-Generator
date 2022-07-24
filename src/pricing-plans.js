import m from 'mithril';

import './css/pricing-plans.scss';
import './css/progress-bar.scss';
import { icons } from './icons';
import { numToPercent } from './utils';

const planDetails = [
  {
    name: "Free",
    color: "#316d26",
    icon: "bunny",
    cost: "$0.00",
    subText: "Continue",

    pros: [
      "Maximum 30 photo uploads",
      "Maximum 50 resolution",
      "Exports: $30",
    ],
    cons: [
      "Images removed after 1 hour",
      "Cannot create shareable links",
      "Cannot link spotify account",
    ]
  },
  {
    name: "Free with Account",
    color: "#2e607f",
    icon: "coffee",
    cost: "$0.00",
    subText: "Sign up Free",

    pros: [
      "Maximum 100 photo uploads",
      "Maximum 75 resolution",
      "First export free, then $20 each",
      "Images stored for a week",
    ],
    cons: [
      "Cannot create shareable links",
      "Cannot link spotify account",
    ]
  },
  {
    name: "Basic",
    color: "#592331",
    icon: "gift",
    cost: "$3.99",
    subText: "Subscribe",

    pros: [
      "Maximum 350 photo uploads",
      "Maximum 100 resolution",
      "5 FREE exports / month, then $15 each",
      "Unlimited image storage",
      "Create shareable links",
      "Use spotify album covers",
    ],
    cons: []
  },
  {
    name: "Premium",
    color: "#411e76",
    icon: "tie",
    cost: "$5.99",
    subText: "Subscribe",

    pros: [
      "Unlimited uploads",
      "Maximum 140 resolution",
      "Unlimited FREE exports",
      "Unlimited image storage",
      "Create shareable links",
      "Use spotify album covers",
    ],
    cons: []
  },
].reverse()

const PricingPlans = {
  view(vnode) {

    return m('div.pricing-plans-page', planDetails.map(plan => 

      m('div.plan-card', { style: { backgroundColor: plan.color } }, [

        m('div.plan-header', [
          m('span.plan-title', plan.name),
          m('div.progressbar', [
            m('svg.progressbar__svg', 
              m('circle.progressbar__svg-circle.circle-html.shadow-html', {
  
                style: `stroke-dashoffset: ${440 - (440 * 100 * plan.pros.length / (plan.pros.length + plan.cons.length)) / 100}`,
                cx: 80, cy: 80, r: 70,
  
              })
            ),
            m('div.plan-icon', icons.subscription[plan.icon]),
          ]),
        ]),

        m('div.plan-body', [

          m('ul.plan-list', 
            plan.pros.map(pro => { return { text: pro, type: 'pro' } })   .concat(
            plan.cons.map(con => { return { text: con, type: 'con' } }) ) .map(point => 
              m('li', { class: point.type }, point.text)
            )
          ),

          m('div.plan-price', [
            m('span.price-dollars', plan.cost),
            m('span.price-month', ' / month'),
          ]),

          m('button.subscribe-button', plan.subText || "Subscribe"),

        ])

      ])

    ))

  }
}

export default PricingPlans;
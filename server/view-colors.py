import numpy as np
from matplotlib import pyplot as plt
import cv2

import colorsys
import math

import json

DATA_PATH = './data-thatha/'
OUT_PATH = './out-thatha/'

def step (r,g,b, repetitions=1):
  lum = math.sqrt( .241 * r + .691 * g + .068 * b )
  h, s, v = colorsys.rgb_to_hsv(r,g,b)
  h2 = int(h * repetitions)
  lum2 = int(lum * repetitions)
  v2 = int(v * repetitions)
  if h2 % 2 == 1:
    v2 = repetitions - v2
    lum = repetitions - lum
  return (h2, lum, v2)


def display_colors(file):
  colors = json.load( open(f'{DATA_PATH}{file}.json', 'r') )

  colors.sort(key=lambda color: step(color[0],color[1],color[2],8) )

  scaled_colours = [[color / 255 for color in row] for row in colors]

  fig, ax = plt.subplots(figsize=(6, 6))

  ax.axis(xmin=0, xmax=len(scaled_colours))
  ax.tick_params(left=False, labelleft=False, bottom=False, labelbottom=False)

  for index, colour in enumerate(scaled_colours):
      ax.axvspan(index, index + 1, color=colour)

avg_colors = np.asarray( json.load( open(f'{DATA_PATH}avg.json', 'r') ) )
dom_colors = np.asarray( json.load( open(f'{DATA_PATH}dom.json', 'r') ) )
mix_colors = 0.8 * avg_colors + 0.2 * dom_colors

with open(f'{DATA_PATH}mix2.json', 'w') as mout:
  json.dump(mix_colors.tolist(), mout)

def show_comparison(ind):

  src_img = cv2.imread(f'{OUT_PATH}{ind}.jpg')

  d_img = np.ones((312,312,3), dtype=np.uint8)
  d_img[:,:] = mix_colors[ind]

  print(mix_colors[ind])

  #cv2.imshow('Source image',src_img)
  cv2.imshow(f'Average Color {ind}.jpg', d_img)

# display_colors('avg')
# display_colors('dom')

tests = [80]

for i in tests:
  show_comparison(i)

#cv2.waitKey(0)
# plt.show()
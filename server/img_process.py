import cv2
import numpy as np

from os import listdir, mkdir
from os.path import isfile, join, exists

import json

def get_dominant(img):
  pixels = np.float32(img.reshape(-1, 3))

  n_colors = 5
  criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 200, .1)
  flags = cv2.KMEANS_RANDOM_CENTERS

  _, labels, palette = cv2.kmeans(pixels, n_colors, None, criteria, 10, flags)
  _, counts = np.unique(labels, return_counts=True)

  return palette[np.argmax(counts)]

def get_average(img):
  average_color_row = np.average(img, axis=0)
  average_color = np.average(average_color_row, axis=0)
  return average_color

def square_img(src_img):
  height, width, channels = src_img.shape

  new_res = height if height < width else width

  x_offset = int(  (width-new_res)/2 )
  y_offset = int( (height-new_res)/2 )

  square = src_img[y_offset:y_offset+new_res, x_offset:x_offset+new_res]

  return square

def add_photos(id='test', dims=72):
  
  DATA_PATH = f'out/{id}/data/'
  OUT_PATH = f'out/{id}/imgs/'
  PHOTO_PATH = f'temp/'

  if not exists(f'out/{id}'):
    mkdir(f'out/{id}')
    mkdir(f'out/{id}/data')
    mkdir(f'out/{id}/imgs')

  pics = [f for f in listdir(PHOTO_PATH) if isfile(join(PHOTO_PATH, f))]
  print('hi', len(pics))

  avg_colors = []
  dom_colors = []
  mix_colors = []
  cache = []

  if exists(f'{DATA_PATH}cache.json'):
    with open(f'{DATA_PATH}cache.json', 'r') as cin:
      cache = json.load(cin)
  offset = len(cache)
  index = offset

  if offset > 0:
    with open(f'{DATA_PATH}avg.json', 'r') as ain:
      avg_colors = json.load(ain)

    with open(f'{DATA_PATH}dom.json', 'r') as din:
      dom_colors = json.load(din)

    with open(f'{DATA_PATH}mix.json', 'r') as min_:
      mix_colors = json.load(min_)

  for i, pic in enumerate(pics):

    if pic in cache:
      continue

    print(f'-- {index} {PHOTO_PATH + pic}')

    src_img = cv2.imread(PHOTO_PATH + pic) #('G:\Mom\Photos\\3FC9D522-8B81-4457-9FB4-39642B732363-827-00000074305BFC75.jpg')

    square = square_img(src_img)  
    resized = cv2.resize(square, (dims, dims))
    cv2.imwrite(f'{OUT_PATH}{index}.jpg',resized)
    print(resized.shape)

    avg_color = get_average(resized)[::-1]
    dom_color = get_dominant(resized)[::-1]
    mix_color = 0.8 * avg_color + 0.2 * dom_color

    avg_colors.append(list(map(int, avg_color.tolist())))
    dom_colors.append(list(map(int, dom_color.tolist())))
    mix_colors.append(list(map(int, mix_color.tolist())))
    cache.append(pic)

    #cv2.imshow('Source image',src_img)
    #cv2.imshow('Average Color',d_img)

    index += 1

  with open(f'{DATA_PATH}avg.json', 'w') as aout:
    json.dump(avg_colors, aout)

  with open(f'{DATA_PATH}dom.json', 'w') as dout:
    json.dump(dom_colors, dout)

  with open(f'{DATA_PATH}mix.json', 'w') as mout:
    json.dump(mix_colors, mout)

  with open(f'{DATA_PATH}cache.json', 'w') as cout:
    json.dump(cache, cout)

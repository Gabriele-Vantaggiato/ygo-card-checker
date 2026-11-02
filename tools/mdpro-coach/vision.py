"""Deck-constrained artwork recognition. Reports observations, never chooses moves."""
from pathlib import Path
import cv2
import numpy as np

class DeckRecognizer:
    def __init__(self, art_root, card_ids):
        self.images = {}
        self.templates = {}
        for card_id in sorted(set(card_ids)):
            path = Path(art_root) / f'{card_id}.jpg'
            image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE) if path.exists() else None
            if image is not None:
                self.images[card_id] = image

    def _templates(self, width, region):
        key = (width, region)
        if key in self.templates:
            return self.templates[key]
        result = []
        for card_id, image in self.images.items():
            for fraction in ([.55, .8, 1] if region == 'hand' else [1]):
                for scale in [.044, .048, .052, .056, .060]:
                    size = max(24, round(width * scale))
                    for ratio in [.88, 1, 1.12]:
                        height = round(size * ratio)
                        template = cv2.resize(image, (size, height), interpolation=cv2.INTER_AREA)
                        for angle in ([-4, 0, 4] if region == 'hand' else [0]):
                            rotated = cv2.warpAffine(template, cv2.getRotationMatrix2D((size/2, height/2), angle, 1), (size,height), borderMode=cv2.BORDER_REFLECT)
                            cropped = rotated[:max(16, round(height*fraction))]
                            if cropped.std() >= 15:
                                result.append((card_id,cropped))
        self.templates[key] = result
        return result

    def detect(self, rgb):
        original_height, original_width = rgb.shape[:2]
        width = min(960, original_width)
        height = round(original_height * width / original_width)
        gray = cv2.cvtColor(cv2.resize(rgb,(width,height)),cv2.COLOR_RGB2GRAY)
        results = []
        for region, bounds in [('hand',(.34,.86,.67,1)),('field',(.25,.54,.75,.88))]:
            x0,y0,x1,y1 = [round(v * (width if i%2 == 0 else height)) for i,v in enumerate(bounds)]
            roi = gray[y0:y1,x0:x1]
            candidates = []
            for card_id,template in self._templates(width,region):
                th,tw = template.shape
                if th > roi.shape[0] or tw > roi.shape[1]:
                    continue
                scores = cv2.matchTemplate(roi,template,cv2.TM_CCOEFF_NORMED)
                for _ in range(3):
                    _,score,_,point = cv2.minMaxLoc(scores)
                    if score < .78:
                        break
                    x,y = point
                    candidates.append({'cardId': card_id,'score': score,'region': region,
                        'box': [(x+x0)/width,(y+y0)/height,tw/width,th/height]})
                    scores[max(0,y-th//2):y+th//2+1,max(0,x-tw//2):x+tw//2+1] = -1
            accepted = []
            for hit in sorted(candidates,key=lambda c: -c['score']):
                x,y,w,h = hit['box']; center = (x+w/2,y+h/2)
                def nearby(other):
                    ox,oy,ow,oh = other['box']
                    return abs(center[0]-ox-ow/2) < w*.55 and abs(center[1]-oy-oh/2) < max(h,oh)*.6
                if any(nearby(other) for other in accepted):
                    continue
                alternate = max((other['score'] for other in candidates if other['cardId'] != hit['cardId'] and nearby(other)),default=0)
                if hit['score']-alternate < .045:
                    continue
                accepted.append(hit)
            results.extend(accepted)
        return sorted(results,key=lambda c: (c['region'],c['box'][0]))

class StableScene:
    """Two consecutive agreeing reads; missing/ambiguous cards never become a guessed ID."""
    def __init__(self):
        self.last = None
        self.streak = 0

    def observe(self, detections):
        key = tuple(sorted((hit['region'],hit['cardId'],round(hit['box'][0]*25)) for hit in detections))
        self.streak = self.streak+1 if key == self.last else 1
        self.last = key
        return detections if self.streak >= 2 else None

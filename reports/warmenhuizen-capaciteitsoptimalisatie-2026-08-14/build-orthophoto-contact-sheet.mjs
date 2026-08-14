#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

const reportDirectory = new URL('./', import.meta.url);
const aerial = JSON.parse(readFileSync(new URL('selected-aerial-bgt.json', reportDirectory), 'utf8'));
const screening = JSON.parse(readFileSync(new URL('location-screening.json', reportDirectory), 'utf8'));
const screenById = new Map(screening.locations.map((location) => [location.id, location]));
const ratingLabels = { green: 'groen', orange: 'oranje' };

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

const cards = aerial.sites.map((site) => {
  const screen = screenById.get(site.id);
  return `<figure>
    <div class="photo"><img src="${escapeHtml(site.aerialImage)}" alt="PDOK-orthofoto rond ${escapeHtml(site.id)}, ${escapeHtml(site.referenceAddress)}"><span class="cross horizontal" aria-hidden="true"></span><span class="cross vertical" aria-hidden="true"></span></div>
    <figcaption><strong>${escapeHtml(site.id)}</strong> · ${escapeHtml(site.referenceAddress)} · ${escapeHtml(ratingLabels[screen?.rating] ?? screen?.rating ?? '')}<br><span>${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}</span><br><a href="${escapeHtml(site.aerialSourceUrl)}">Open exact WMS-bronverzoek</a></figcaption>
  </figure>`;
}).join('\n');

const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PDOK-orthofoto’s – 25 Warmenhuizen-zoekzones</title><style>
body{margin:0;padding:24px;color:#0f172a;background:#f1f5f9;font:14px/1.45 system-ui,sans-serif}main{max-width:1500px;margin:auto}h1{margin:0 0 8px}.note{max-width:900px;color:#475569}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}figure{margin:0;padding:12px;background:white;border:1px solid #dbe3ec;border-radius:12px}.photo{position:relative;aspect-ratio:1;overflow:hidden}.photo img{display:block;width:100%;height:100%;object-fit:cover}.cross{position:absolute;left:50%;top:50%;background:#ef4444;box-shadow:0 0 0 1px white}.horizontal{width:38px;height:3px;transform:translate(-50%,-50%)}.vertical{width:3px;height:38px;transform:translate(-50%,-50%)}figcaption{padding:9px 2px 0}figcaption span{color:#64748b;font:12px ui-monospace,monospace}a{color:#1d4ed8}</style></head><body><main><h1>PDOK-orthofoto’s van de 25 nieuwe zoekankers</h1><p class="note">Officiële laag 2026_orthoHR, uitsnede 150 × 150 meter. Het rode CSS-doelkruis ligt op het exacte rekenanker; de 25 huidige JPEG-bronuitsneden zijn ongewijzigd. Dit zijn orthofoto’s, geen satellietbeelden en geen bouwvrijgave. Parkeerdruk en inrichting kunnen sinds de opname zijn veranderd.</p><div class="grid">${cards}</div></main></body></html>`;
writeFileSync(new URL('orthophoto-contact-sheet.html', reportDirectory), html);
console.log(JSON.stringify({ sites: aerial.sites.length, output: 'orthophoto-contact-sheet.html' }, null, 2));

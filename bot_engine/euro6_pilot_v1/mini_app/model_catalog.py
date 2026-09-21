"""Optional, completed offline model generations. Never load partial training."""
import json
from pathlib import Path
import numpy as np
from players import ModelPlayer
from sizing import SizingPolicy
import euro6_train_policy_v3 as v3

BASE_PROFILES=('human_emphasis','balanced','pluribus_emphasis')
LABELS={'human_emphasis':'Human','balanced':'Balanced','pluribus_emphasis':'Pluribus-Daten'}
RUNS=Path(__file__).resolve().parents[2]/'euro6_rl_v1/runs'
GENERATIONS={'rl':'experiment_001','hrc':'hrc_001'}
DEPTH_PROFILES=('balanced','pluribus_emphasis')
DEPTH_RUN='depth_001'
PRESETS={'mixed':('human_emphasis','balanced','pluribus_emphasis','human_emphasis','balanced'),
         **{p:(p,)*5 for p in BASE_PROFILES}}
for prefix in GENERATIONS:
    PRESETS['mixed_'+prefix]=tuple(prefix+'_'+p for p in PRESETS['mixed'])
    for p in BASE_PROFILES:
        PRESETS[prefix+'_'+p]=(prefix+'_'+p,)*5
PRESETS['depth_best']=('depth_champion',)*5
PRESETS['mixed_depth']=('depth_balanced','depth_pluribus_emphasis','depth_balanced','depth_pluribus_emphasis','depth_balanced')
for p in DEPTH_PROFILES:
    PRESETS['depth_'+p]=('depth_'+p,)*5


class ExportPlayer(ModelPlayer):
    def __init__(self,directory,profile):
        self.profile=profile
        self.meta=json.loads((directory/'decision_policy_model_v3_features.json').read_text())
        if self.meta['features']!=v3.feature_spec() or self.meta['ensemble_size']!=1:
            raise ValueError('Incompatible experiment features')
        with np.load(directory/'decision_policy_model_v3.npz',allow_pickle=False) as d:
            self.data={k:d[k].copy() for k in d.files}
        self.models=[tuple(self.data[k+'_0'] for k in ('W1','b1','W2','b2','W3','b3'))]
        self.sizing=SizingPolicy.__new__(SizingPolicy)
        with np.load(directory/'sizing.npz',allow_pickle=False) as d:
            self.sizing.data={k:d[k].copy() for k in d.files}


def load_optional():
    models={}
    for prefix,run in GENERATIONS.items():
        root=RUNS/run
        path=root/'manifest.json'
        if not path.exists():
            continue
        manifest=json.loads(path.read_text(encoding='utf-8'))
        if manifest.get('status')!='complete' or not (root/'exported/manifest.json').exists():
            continue
        for p in BASE_PROFILES:
            key=prefix+'_'+p
            models[key]=ExportPlayer(root/'exported'/p,key)
    root=RUNS/DEPTH_RUN
    if all((root/p).exists() for p in ('manifest.json','exported/manifest.json','export_verification.json')):
        manifest=json.loads((root/'manifest.json').read_text())
        verified=json.loads((root/'export_verification.json').read_text())
        if manifest.get('status')=='complete' and all(verified.get(p,{}).get('all_actions_legal') for p in DEPTH_PROFILES):
            for p in DEPTH_PROFILES:
                key='depth_'+p
                models[key]=ExportPlayer(root/'exported'/p,key)
            winner=manifest['champion']
            if winner not in DEPTH_PROFILES:
                raise ValueError('Unknown multi-stack selection')
            models['depth_champion']=models['depth_'+winner]
    return models


def catalog(models):
    names={p:LABELS[p] for p in BASE_PROFILES}
    for prefix in GENERATIONS:
        for p in BASE_PROFILES:
            short='Pluri' if p=='pluribus_emphasis' else LABELS[p]
            names[prefix+'_'+p]=prefix.upper()+' '+short
    names.update(depth_balanced='MS Balanced',depth_pluribus_emphasis='MS Pluri',depth_champion='MS Auswahl')
    rows=[]
    for preset,lineup in PRESETS.items():
        if not all(p in models for p in lineup):
            continue
        if preset=='mixed':
            label='Gemischt · Ausgangsmodelle'
        elif preset=='mixed_hrc':
            label='Gemischt · HRC+RL (experimentell)'
        elif preset=='mixed_rl':
            label='Gemischt · RL v1'
        elif preset=='depth_best':
            label='5 × Testauswahl · variable Stacks'
        elif preset=='mixed_depth':
            label='Gemischt · Multi-Stack'
        else:
            label='5 × '+names[preset]+(' (experimentell)' if preset.startswith('hrc_') else '')
        rows.append(dict(value=preset,label=label))
    rows.sort(key=lambda r:0 if r['value']=='depth_best' else 1)
    return dict(profiles=rows,names=names,
        notice='Multi-Stack: wechselnde Stacks und Sitzungen, reguläre Starts 1–1000 BB. '
            'Testauswahl ist kein GTO- oder Echtgeld-Nachweis. Stacks und Blinds bleiben unverändert.')

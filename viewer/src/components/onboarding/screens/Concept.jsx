import React, { useEffect } from 'react';
import ConceptVisual from '../ConceptVisuals';
import DagMini from '../DagMini';
import { PERSONA_CONTENT, rolePluralLabel } from '../concepts';

export default function Concept({ concept, step, role, onNavigate, fire }) {
  useEffect(() => {
    fire('onboarding_concept_seen', { concept: concept.id });
  }, [concept.id, fire]);

  const persona = PERSONA_CONTENT[role] || PERSONA_CONTENT.other;
  const plural = rolePluralLabel(role);
  const exampleLabel = plural ? `For ${plural}` : 'For you';
  const exampleKey = `${concept.id}_example`;
  const example = persona[exampleKey] || persona.model_example;

  return (
    <div className="onb-screen-inner onb-screen-enter" key={concept.id}>
      <div className="onb-concept">
        <div>
          <div className="onb-concept-eyebrow onb-concept-eyebrow--dag">
            <DagMini step={step} placement="inline" onNavigate={onNavigate} />
          </div>
          <h2 className="onb-concept-h2">{concept.title}.</h2>
          <p className="onb-concept-def">{concept.def}</p>
          <div className="onb-concept-example">
            <span className="onb-concept-example__label">{exampleLabel}</span>
            <div className="onb-concept-example__body">{example}</div>
          </div>
        </div>
        <ConceptVisual conceptId={concept.id} />
      </div>
    </div>
  );
}

import React from 'react';
import { Link } from 'react-router-dom';
import { getTypeColors, getTypeIcon } from './views/common/objectTypeConfigs';

/**
 * An object an agent touched, rendered as somewhere you can go.
 *
 * Shared by the activity log and the per-turn tool calls, because the value of
 * both is reaching the thing that changed — and two spellings of `type:name`
 * would be two of them that disagree about where an object lives.
 */
const AgentObjectLink = ({ object }) => {
  const { bg, text, border } = getTypeColors(object.type);
  const Icon = getTypeIcon(object.type);
  return (
    <Link
      to={`/workspace?edit=${encodeURIComponent(`${object.type}:${object.name}`)}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${bg} ${text} ${border} hover:underline`}
      data-testid={`agent-action-object-${object.name}`}
    >
      {Icon && <Icon className="shrink-0" size={12} />}
      {object.name}
    </Link>
  );
};

export default AgentObjectLink;

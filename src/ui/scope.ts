// Walks a file's page tree and collects the nodes that fall inside the
// user-configured scope (which node types, at which depth, on which pages).
import type { FigmaNodeSummary } from './figmaApi';
import type { ScanTarget, ScopeConfig } from '../shared/messages';

/**
 * MAIN_COMPONENT / SECTION / FRAME are simple type matches. INSTANCE_COMPONENT
 * is NOT "any INSTANCE node" -- it means "a COMPONENT/COMPONENT_SET whose
 * subtree contains at least one INSTANCE", i.e. the components most exposed
 * to the override-reset bug this whole plugin exists to catch (spec.md §1).
 * That needs its own recursive check below rather than a type-set lookup.
 */
const SIMPLE_ATTRIBUTE_TYPES: Record<'MAIN_COMPONENT' | 'SECTION' | 'FRAME', string[]> = {
  MAIN_COMPONENT: ['COMPONENT', 'COMPONENT_SET'],
  SECTION: ['SECTION'],
  FRAME: ['FRAME'],
};

/** Page root counts as depth 1, per spec.md section 5. */
const ROOT_DEPTH = 1;

export function resolveScopeTargets(pages: FigmaNodeSummary[], scope: ScopeConfig): ScanTarget[] {
  const wantedSimpleTypes = new Set(
    scope.attributes
      .filter((attribute): attribute is 'MAIN_COMPONENT' | 'SECTION' | 'FRAME' => attribute !== 'INSTANCE_COMPONENT')
      .flatMap((attribute) => SIMPLE_ATTRIBUTE_TYPES[attribute])
  );
  const wantInstanceContainers = scope.attributes.includes('INSTANCE_COMPONENT');

  const targets: ScanTarget[] = [];

  for (const page of pages) {
    if (scope.excludedPageNames.includes(page.name)) continue;
    walk(page.children ?? [], [page.name], ROOT_DEPTH, page.name);
  }

  function walk(nodes: FigmaNodeSummary[], pathParts: string[], depth: number, pageName: string) {
    for (const node of nodes) {
      const depthMatches = scope.depth === 'ALL' || depth === scope.depth;
      const isComponentLike = node.type === 'COMPONENT' || node.type === 'COMPONENT_SET';
      const matches =
        depthMatches &&
        (wantedSimpleTypes.has(node.type) || (wantInstanceContainers && isComponentLike && containsInstance(node)));

      if (matches) {
        const path = pathParts.join(' / ');
        targets.push({
          nodeId: node.id,
          matchKey: node.componentKey ?? `${path} / ${node.name}`,
          name: node.name,
          path,
          pageName,
        });
      }
      // Keep descending regardless of whether this node matched: a Section in
      // scope can still contain Frames that are separately in scope too.
      if (node.children) {
        walk(node.children, [...pathParts, node.name], depth + 1, pageName);
      }
    }
  }

  return targets;
}

function containsInstance(node: FigmaNodeSummary): boolean {
  if (!node.children) return false;
  return node.children.some((child) => child.type === 'INSTANCE' || containsInstance(child));
}

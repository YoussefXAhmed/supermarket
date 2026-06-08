/**
 * Generic workspace settings page. Each workspace's route mounts this
 * with its own `workspace` prop, label, and optional extra-blocks render.
 *
 * Reuses Phase 3's SectionBlock + SettingsAuditLog so the UI is
 * pixel-identical to /admin/settings/<section> — same field controls,
 * same save/reset/audit flow.
 */
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../../../components/ui';
import SectionForm from './SectionForm';
import SectionBlock from './SectionBlock';
import SettingsAuditLog from './SettingsAuditLog';
import {
  getWorkspaceSection, updateWorkspaceSection,
  workspaceAuditSection,
} from '../../../../services/workspaceSettingsApi';

export default function WorkspaceSettingsPage({
  workspace,
  Layout,
  titleKey,
  descriptionKey,
  // Optional render-prop for workspace-specific extras (e.g. catalog
  // deep-links, picker UI). Mounted ABOVE the standard form.
  renderExtras,
  // Optional render-prop for workspace-specific extras mounted BELOW.
  renderBelow,
}) {
  const { t } = useTranslation();
  const auditSection = workspaceAuditSection(workspace);

  const body = (
    <>
      <PageHeader
        title={t(titleKey, { defaultValue: `${workspace} settings` })}
        subtitle={t('settings.workspaceSubtitle', {
          defaultValue: 'Workspace-scoped policies — every change is audited',
        })}
        dense
      />

      {renderExtras ? renderExtras() : null}

      <SectionForm
        section={auditSection}
        title={t(`${titleKey}.config`, { defaultValue: 'Configuration' })}
        description={descriptionKey ? t(descriptionKey, { defaultValue: '' }) : null}
        loader={() => getWorkspaceSection(workspace)}
        onSave={(payload) => updateWorkspaceSection(workspace, payload)}
      >
        {({ values, setField, data }) => (
          <>
            {(data?.blocks || []).map((block) => (
              <SectionBlock
                key={block.doctype}
                block={block}
                values={values}
                setField={setField}
              />
            ))}
          </>
        )}
      </SectionForm>

      {renderBelow ? renderBelow() : null}

      <SettingsAuditLog section={auditSection} />
    </>
  );

  return Layout ? <Layout>{body}</Layout> : body;
}

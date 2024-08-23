import type {
  AgentConfigurationType,
  AppType,
  DataSourceViewType,
  PlanType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import { throwIfInvalidAgentConfiguration } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";

import AssistantBuilder from "@app/components/assistant_builder/AssistantBuilder";
import { AssistantBuilderProvider } from "@app/components/assistant_builder/AssistantBuilderContext";
import {
  buildInitialActions,
  getAccessibleSourcesAndApps,
} from "@app/components/assistant_builder/server_side_props_helpers";
import type {
  AssistantBuilderInitialState,
  BuilderFlow,
} from "@app/components/assistant_builder/types";
import { BUILDER_FLOWS } from "@app/components/assistant_builder/types";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  plan: PlanType;
  gaTrackingId: string;
  dataSourceViews: DataSourceViewType[];
  dustApps: AppType[];
  actions: AssistantBuilderInitialState["actions"];
  agentConfiguration: AgentConfigurationType;
  flow: BuilderFlow;
  baseUrl: string;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const plan = auth.plan();
  const subscription = auth.subscription();
  if (
    !owner ||
    !plan ||
    !subscription ||
    !auth.isUser() ||
    !context.params?.aId
  ) {
    return {
      notFound: true,
    };
  }

  const [{ dataSourceViews, dustApps }, configuration] = await Promise.all([
    getAccessibleSourcesAndApps(auth),
    getAgentConfiguration(auth, context.params?.aId as string),
  ]);

  if (configuration?.scope === "workspace" && !auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  if (!configuration) {
    return {
      notFound: true,
    };
  }

  const flow: BuilderFlow = BUILDER_FLOWS.includes(
    context.query.flow as BuilderFlow
  )
    ? (context.query.flow as BuilderFlow)
    : "personal_assistants";

  return {
    props: {
      owner,
      plan,
      subscription,
      gaTrackingId: config.getGaTrackingId(),
      dataSourceViews,
      dustApps,
      actions: await buildInitialActions({
        dataSourceViews,
        dustApps,
        configuration,
      }),
      agentConfiguration: configuration,
      flow,
      baseUrl: config.getClientFacingUrl(),
    },
  };
});

export default function EditAssistant({
  owner,
  subscription,
  plan,
  gaTrackingId,
  dataSourceViews,
  dustApps,
  actions,
  agentConfiguration,
  flow,
  baseUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  throwIfInvalidAgentConfiguration(agentConfiguration);

  if (agentConfiguration.scope === "global") {
    throw new Error("Cannot edit global assistant");
  }

  if (agentConfiguration.status === "archived") {
    throw new Error("Cannot edit archived assistant");
  }

  return (
    <AssistantBuilderProvider
      dustApps={dustApps}
      dataSourceViews={dataSourceViews}
    >
      <AssistantBuilder
        owner={owner}
        subscription={subscription}
        plan={plan}
        gaTrackingId={gaTrackingId}
        flow={flow}
        initialBuilderState={{
          scope: agentConfiguration.scope,
          handle: agentConfiguration.name,
          description: agentConfiguration.description,
          instructions: agentConfiguration.instructions || "", // TODO we don't support null in the UI yet
          avatarUrl: agentConfiguration.pictureUrl,
          generationSettings: {
            modelSettings: {
              modelId: agentConfiguration.model.modelId,
              providerId: agentConfiguration.model.providerId,
            },
            temperature: agentConfiguration.model.temperature,
          },
          actions,
          visualizationEnabled: agentConfiguration.visualizationEnabled,
          maxStepsPerRun: agentConfiguration.maxStepsPerRun,
          templateId: agentConfiguration.templateId,
        }}
        agentConfigurationId={agentConfiguration.sId}
        baseUrl={baseUrl}
        defaultTemplate={null}
      />
    </AssistantBuilderProvider>
  );
}

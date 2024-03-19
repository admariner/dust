import {
  Button,
  CardIcon,
  Chip,
  Dialog,
  DropdownMenu,
  MoreIcon,
  Page,
  ShapesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import type { PlanInvitationType, SubscriptionType } from "@dust-tt/types";
import type * as t from "io-ts";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useContext, useEffect, useState } from "react";

import { PricePlans } from "@app/components/PlansTables";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { SubscriptionContactUsDrawer } from "@app/components/SubscriptionContactUsDrawer";
import { PRO_PLAN_29_COST_EUR } from "@app/lib/client/subscription";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import {
  FREE_TEST_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
  isUpgraded,
} from "@app/lib/plans/plan_codes";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { getPlanInvitation } from "@app/lib/plans/subscription";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/workspace_usage";
import type { PatchSubscriptionRequestBody } from "@app/pages/api/w/[wId]/subscriptions";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
  planInvitation: PlanInvitationType | null;
  trialDaysRemaining: number | null;
  gaTrackingId: string;
  workspaceSeats: number;
  estimatedMonthlyBilling: number;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();
  if (!owner || !auth.isAdmin() || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  const planInvitation = await getPlanInvitation(auth);

  let trialDaysRemaining = null;
  if (subscription.trialing && subscription.stripeSubscriptionId) {
    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    stripeSubscription;
    trialDaysRemaining = stripeSubscription.trial_end
      ? Math.ceil(
          (stripeSubscription.trial_end * 1000 - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      : null;
  }
  const workspaceSeats = await countActiveSeatsInWorkspace(owner.sId);
  const estimatedMonthlyBilling = PRO_PLAN_29_COST_EUR * workspaceSeats;

  return {
    props: {
      owner,
      subscription,
      trialDaysRemaining,
      planInvitation: planInvitation,
      gaTrackingId: GA_TRACKING_ID,
      user,
      workspaceSeats,
      estimatedMonthlyBilling,
    },
  };
});

export default function Subscription({
  owner,
  user,
  subscription,
  planInvitation,
  trialDaysRemaining,
  gaTrackingId,
  workspaceSeats,
  estimatedMonthlyBilling,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);
  const [isWebhookProcessing, setIsWebhookProcessing] =
    React.useState<boolean>(false);

  const [showContactUsDrawer, setShowContactUsDrawer] = useState(false);
  const [showSkipFreeTrialDialog, setShowSkipFreeTrialDialog] = useState(false);
  const [showCancelFreeTrialDialog, setShowCancelFreeTrialDialog] =
    useState(false);
  useEffect(() => {
    if (router.query.type === "succeeded") {
      if (subscription.plan.code === router.query.plan_code) {
        sendNotification({
          type: "success",
          title: `Subscription to ${subscription.plan.name}`,
          description: `Your subscription to ${subscription.plan.name} is now active. Thank you for your trust.`,
        });
        // Then we remove the query params to avoid going through this logic again.
        void router.push(
          { pathname: `/w/${owner.sId}/subscription` },
          undefined,
          {
            shallow: true,
          }
        );
      } else {
        // If the Stripe webhook is not yet received, we try waiting for it and reload the page every 5 seconds until it's done.
        setIsWebhookProcessing(true);
        setTimeout(() => {
          void router.reload();
        }, 5000);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally passing an empty dependency array to execute only once

  const { submit: handleSubscribePlan, isSubmitting: isSubscribingPlan } =
    useSubmitFunction(async () => {
      const res = await fetch(`/api/w/${owner.sId}/subscriptions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        sendNotification({
          type: "error",
          title: "Subscription failed",
          description: "Failed to subscribe to a new plan.",
        });
        // Then we remove the query params to avoid going through this logic again.
        void router.push(
          { pathname: `/w/${owner.sId}/subscription` },
          undefined,
          {
            shallow: true,
          }
        );
      } else {
        const content = await res.json();
        if (content.checkoutUrl) {
          await router.push(content.checkoutUrl);
        } else if (content.success) {
          router.reload(); // We cannot swr the plan so we just reload the page.
        }
      }
    });

  const {
    submit: handleGoToStripePortal,
    isSubmitting: isGoingToStripePortal,
  } = useSubmitFunction(async () => {
    const res = await fetch("/api/stripe/portal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceId: owner.sId,
      }),
    });
    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Failed to open billing dashboard",
        description: "Failed to open billing dashboard.",
      });
    } else {
      const content = await res.json();
      if (content.portalUrl) {
        window.open(content.portalUrl, "_blank");
      }
    }
  });

  const { submit: skipFreeTrial, isSubmitting: skipFreeTrialIsSubmitting } =
    useSubmitFunction(async () => {
      try {
        const res = await fetch(`/api/w/${owner.sId}/subscriptions`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "pay_now",
          } satisfies t.TypeOf<typeof PatchSubscriptionRequestBody>),
        });
        if (!res.ok) {
          sendNotification({
            type: "error",
            title: "Transition to paid plan failed",
            description: "Failed to transition to paid plan.",
          });
        } else {
          sendNotification({
            type: "success",
            title: "Upgrade successful",
            description: "Redirecting...",
          });
          await new Promise((resolve) => setTimeout(resolve, 3000));
          router.reload();
        }
      } finally {
        setShowSkipFreeTrialDialog(false);
      }
    });

  const { submit: cancelFreeTrial, isSubmitting: cancelFreeTrialSubmitting } =
    useSubmitFunction(async () => {
      try {
        const res = await fetch(`/api/w/${owner.sId}/subscriptions`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "cancel_free_trial",
          } satisfies t.TypeOf<typeof PatchSubscriptionRequestBody>),
        });
        if (!res.ok) {
          sendNotification({
            type: "error",
            title: "Failed to open billing dashboard",
            description: "Failed to open billing dashboard.",
          });
        } else {
          sendNotification({
            type: "success",
            title: "Free trial cancelled",
            description: "Redirecting...",
          });
          await router.push(`/w/${owner.sId}/subscribe`);
        }
      } finally {
        setShowCancelFreeTrialDialog(false);
      }
    });

  const isProcessing = isSubscribingPlan || isGoingToStripePortal;

  const plan = subscription.plan;
  const chipColor = !isUpgraded(plan) ? "emerald" : "sky";

  const onClickProPlan = async () => handleSubscribePlan();
  const onClickEnterprisePlan = () => {
    setShowContactUsDrawer(true);
  };
  const onSubscribeEnterprisePlan = async () => {
    if (!planInvitation) {
      throw new Error("Unreachable: No plan invitation");
    }
    await handleSubscribePlan();
  };

  const planLabel =
    trialDaysRemaining === null
      ? plan.name
      : `${plan.name} Trial: ${trialDaysRemaining} Days remaining`;

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="admin"
      subNavigation={subNavigationAdmin({ owner, current: "subscription" })}
    >
      <CancelFreeTrialDialog
        show={showCancelFreeTrialDialog}
        onClose={() => setShowCancelFreeTrialDialog(false)}
        onValidate={cancelFreeTrial}
        isSaving={cancelFreeTrialSubmitting}
      />

      <SkipFreeTrialDialog
        show={showSkipFreeTrialDialog}
        onClose={() => {
          setShowSkipFreeTrialDialog(false);
        }}
        onValidate={skipFreeTrial}
        workspaceSeats={workspaceSeats}
        estimatedMonthlyBilling={estimatedMonthlyBilling}
        isSaving={skipFreeTrialIsSubmitting}
      />
      <SubscriptionContactUsDrawer
        show={showContactUsDrawer}
        onClose={() => {
          setShowContactUsDrawer(false);
        }}
        initialEmail={user.email}
      />
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Subscription"
          icon={ShapesIcon}
          description="Manage and discover Dust plans."
        />
        {!planInvitation ? (
          <Page.Vertical align="stretch" gap="md">
            <Page.H variant="h5">Your plan </Page.H>
            <div>
              {isWebhookProcessing ? (
                <Spinner />
              ) : (
                <>
                  <Page.Horizontal gap="sm">
                    <Chip size="sm" color={chipColor} label={planLabel} />
                    {!subscription.trialing && (
                      <DropdownMenu>
                        <DropdownMenu.Button>
                          <Button
                            icon={MoreIcon}
                            variant="tertiary"
                            labelVisible={false}
                            disabledTooltip={true}
                            label=""
                          />
                        </DropdownMenu.Button>
                        <DropdownMenu.Items origin="auto" width={210}>
                          <DropdownMenu.Item
                            label="Manage my subscription"
                            onClick={handleGoToStripePortal}
                          />
                        </DropdownMenu.Items>
                      </DropdownMenu>
                    )}
                  </Page.Horizontal>
                </>
              )}
            </div>
            {subscription.trialing && (
              <Page.Vertical>
                <Page.Horizontal gap="sm">
                  <Button
                    onClick={() => setShowSkipFreeTrialDialog(true)}
                    label="Skip trial & Upgrade now"
                  />
                  <Button
                    label="Cancel my trial and downgrade now"
                    variant="tertiary"
                    onClick={() => setShowCancelFreeTrialDialog(true)}
                  />
                </Page.Horizontal>
              </Page.Vertical>
            )}
            <div className="h-4"></div>
            <Page.Vertical gap="sm">
              <Page.H variant="h5">Payment, invoicing & billing</Page.H>
              {plan.billingType === "per_seat" && (
                <>
                  <Page.P>
                    Estimated monthly billing:{" "}
                    <span className="font-bold">
                      {estimatedMonthlyBilling}€
                    </span>{" "}
                    (excluding taxes)
                  </Page.P>
                  <Page.P>
                    {workspaceSeats === 1 ? (
                      <>
                        {workspaceSeats} member, {PRO_PLAN_29_COST_EUR}€ per
                        member
                      </>
                    ) : (
                      <>
                        {workspaceSeats} members, {PRO_PLAN_29_COST_EUR}€ per
                        members
                      </>
                    )}
                  </Page.P>
                </>
              )}
              <div className="my-5">
                <Button
                  icon={CardIcon}
                  label="Dust’s dashboard on Stripe"
                  variant="tertiary"
                />
              </div>
            </Page.Vertical>
            {!plan ||
              ([FREE_TEST_PLAN_CODE, FREE_UPGRADED_PLAN_CODE].includes(
                plan.code
              ) && (
                <>
                  <div className="pt-2">
                    <Page.H variant="h5">Manage my plan</Page.H>
                    <div className="s-h-full s-w-full pt-2">
                      <PricePlans
                        size="xs"
                        className="lg:hidden"
                        isTabs
                        plan={plan}
                        onClickProPlan={onClickProPlan}
                        onClickEnterprisePlan={onClickEnterprisePlan}
                        isProcessing={isProcessing}
                        display="landing"
                      />
                      <PricePlans
                        size="xs"
                        flexCSS="gap-3"
                        className="hidden lg:flex"
                        plan={plan}
                        onClickProPlan={onClickProPlan}
                        onClickEnterprisePlan={onClickEnterprisePlan}
                        isProcessing={isProcessing}
                        display="landing"
                      />
                    </div>
                  </div>
                  <Link href="/terms" target="_blank" className="text-sm">
                    Terms of use apply to all plans.
                  </Link>
                </>
              ))}
          </Page.Vertical>
        ) : (
          <Page.Vertical>
            <div>
              You have been invited to the <b>{planInvitation.planName}</b>{" "}
              enterprise plan.
            </div>
            <Button label="Subscribe" onClick={onSubscribeEnterprisePlan} />
          </Page.Vertical>
        )}
      </Page.Vertical>
      <div className="h-12" />
    </AppLayout>
  );
}

function SkipFreeTrialDialog({
  show,
  onClose,
  onValidate,
  workspaceSeats,
  estimatedMonthlyBilling,
  isSaving,
}: {
  show: boolean;
  onClose: () => void;
  onValidate: () => void;
  workspaceSeats: number;
  estimatedMonthlyBilling: number;
  isSaving: boolean;
}) {
  return (
    <Dialog
      isOpen={show}
      title={`Skip trial`}
      onCancel={onClose}
      validateLabel="Upgrade now"
      validateVariant="primary"
      onValidate={() => {
        onValidate();
      }}
      isSaving={isSaving}
    >
      <Page.P>
        {(() => {
          if (workspaceSeats === 1) {
            return (
              <>
                Billing will start immediately for {workspaceSeats} member of
                your workspace ({estimatedMonthlyBilling}€ monthly).
              </>
            );
          }
          return (
            <>
              Billing will start immediately for the {workspaceSeats} members of
              your workspace ({estimatedMonthlyBilling}€ monthly).
            </>
          );
        })()}
      </Page.P>
    </Dialog>
  );
}

function CancelFreeTrialDialog({
  show,
  onClose,
  onValidate,
  isSaving,
}: {
  show: boolean;
  onClose: () => void;
  onValidate: () => Promise<void>;
  isSaving: boolean;
}) {
  return (
    <Dialog
      isOpen={show}
      title={`Cancel my trial`}
      onCancel={onClose}
      validateLabel="Yes, cancel trial"
      validateVariant="primaryWarning"
      onValidate={onValidate}
      isSaving={isSaving}
    >
      <Page.Vertical gap="md">
        <Page.P>
          <span className="font-bold">
            All your workspace data will be deleted and you will lose access to
            your Dust workspace.
          </span>
        </Page.P>

        <Page.P>Are you sure you want to cancel ?</Page.P>
      </Page.Vertical>
    </Dialog>
  );
}

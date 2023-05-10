import { Menu } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import {
  ArchiveBoxIcon,
  BoltIcon,
  Cog6ToothIcon,
  DocumentIcon,
} from "@heroicons/react/24/outline";
import { CodeBracketIcon } from "@heroicons/react/24/solid";
import Link from "next/link";

import { classNames } from "@app/lib/utils";
import { AppType } from "@app/types/app";
import { WorkspaceType } from "@app/types/user";

export default function MainTab({
  app,
  currentTab,
  owner,
}: {
  app: AppType;
  currentTab: string;
  owner: WorkspaceType;
}) {
  const tabs: { name: string; href: string; icon: JSX.Element }[] = [
    {
      name: "Specification",
      href: `/w/${owner.sId}/a/${app.sId}`,
      icon: (
        <CodeBracketIcon
          className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0"
          aria-hidden="true"
        />
      ),
    },
    {
      name: "Datasets",
      href: `/w/${owner.sId}/a/${app.sId}/datasets`,
      icon: (
        <DocumentIcon
          className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0"
          aria-hidden="true"
        />
      ),
    },
  ];

  if (
    owner.role === "user" ||
    owner.role === "builder" ||
    owner.role === "admin"
  ) {
    tabs.push({
      name: "Use",
      href: `/w/${owner.sId}/a/${app.sId}/execute`,
      icon: (
        <BoltIcon
          className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0"
          aria-hidden="true"
        />
      ),
    });
    tabs.push({
      name: "Logs",
      href: `/w/${owner.sId}/a/${app.sId}/runs`,
      icon: (
        <ArchiveBoxIcon
          className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0"
          aria-hidden="true"
        />
      ),
    });
  }
  if (owner.role === "builder" || owner.role === "admin") {
    tabs.push({
      name: "Settings",
      href: `/w/${owner.sId}/a/${app.sId}/settings`,
      icon: (
        <Cog6ToothIcon
          className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0"
          aria-hidden="true"
        />
      ),
    });
  }

  let currTab = tabs.find((tab) => tab.name == currentTab);

  return (
    <div className="w-full">
      <div className="border-b border-gray-200 px-2 sm:hidden">
        <Menu as="div" className="relative">
          <div>
            <Menu.Button className="flex w-full items-center text-sm font-bold text-gray-700 focus:outline-none">
              <div className="flex flex-initial px-4 py-3">
                {currTab?.icon}
                {currTab?.name}
              </div>
              <div className="flex">
                <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-gray-700" />
              </div>
            </Menu.Button>
          </div>
          <Menu.Items className="absolute left-0 z-10 mt-0 w-full origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
            {tabs.map((tab) => (
              <Menu.Item key={tab.name}>
                {({ active }) => (
                  <Link
                    href={tab.href}
                    key={tab.name}
                    className={classNames(
                      "flex whitespace-nowrap font-medium",
                      active ? "bg-gray-50" : "",
                      "block px-4 py-3 text-sm text-gray-500"
                    )}
                  >
                    {tab.icon}
                    {tab.name}
                  </Link>
                )}
              </Menu.Item>
            ))}
          </Menu.Items>
        </Menu>
      </div>

      <div className="hidden sm:block">
        <div className="border-b border-gray-200 px-4">
          <nav className="-mb-px flex" aria-label="Tabs">
            {tabs.map((tab) => (
              <div key={tab.name} className="flex flex-initial">
                <Link
                  href={tab.href}
                  key={tab.name}
                  className={classNames(
                    "flex items-center whitespace-nowrap border-b-2 px-4 py-3 text-sm",
                    tab.name === currentTab
                      ? "border-gray-500 font-bold text-gray-700"
                      : "border-transparent font-medium text-gray-500 hover:border-gray-200 hover:text-gray-700"
                  )}
                >
                  {tab.icon}
                  {tab.name}
                </Link>
              </div>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

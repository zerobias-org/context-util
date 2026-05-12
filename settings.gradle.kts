// settings.gradle.kts for org/context-util
//
// Same Phase-3 monorepo plumbing as org/util — the Gradle plugins live
// in build-tools (published from org/util) and we just consume them
// here. No local includeBuild: build-tools is a Maven dep, resolved
// from mavenLocal first (so a fresh `publishToMavenLocal` from
// org/util/packages/build-tools wins during local iteration), then
// GitHub Packages, then plugin portal / Maven Central.

import com.zerobias.buildtools.monorepo.Workspace

pluginManagement {
    repositories {
        mavenLocal()
        maven {
            url = uri("https://maven.pkg.github.com/zerobias-org/util")
            credentials {
                username = System.getenv("GITHUB_ACTOR") ?: "zerobias-org"
                password = System.getenv("READ_TOKEN")
                    ?: System.getenv("NPM_TOKEN")
                    ?: System.getenv("GITHUB_TOKEN")
                    ?: ""
            }
        }
        gradlePluginPortal()
        mavenCentral()
    }
}

buildscript {
    repositories {
        mavenLocal()
        maven {
            url = uri("https://maven.pkg.github.com/zerobias-org/util")
            credentials {
                username = System.getenv("GITHUB_ACTOR") ?: "zerobias-org"
                password = System.getenv("READ_TOKEN")
                    ?: System.getenv("NPM_TOKEN")
                    ?: System.getenv("GITHUB_TOKEN")
                    ?: ""
            }
        }
        gradlePluginPortal()
        mavenCentral()
    }
    dependencies {
        classpath("com.zerobias:build-tools:1.+")
    }
}

rootProject.name = "context-util"

// No standalone-root exclusions — context-util only has TypeScript
// workspaces, no nested Java/Gradle projects that publish independently.
val packages = Workspace.discoverWorkspaces(settings.rootDir)
for ((_, pkg) in packages) {
    val gradlePath = ":" + pkg.relDir.replace("/", ":")
    include(gradlePath)
    project(gradlePath).projectDir = pkg.dir
}
println("zb.monorepo: included ${packages.size} workspace packages from ${settings.rootDir.name}")

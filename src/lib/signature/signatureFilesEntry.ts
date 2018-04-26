import { SignatureEntry } from "../signature";
import { VerificationContext } from "./verificationContext";
import { ModuleVerificationResult, ModuleVerificationStatus } from "../moduleVerifier";
import * as path from 'path';
import { sha512OfFile } from "../fsPromise";
import { SignatureIdentity } from "./signatureIdentity";

export interface SignatureFilesEntryData {
    files: SignatureFileEntry[];
}

export class SignatureFilesEntry implements SignatureEntry {
    public entry: string = "files/v1alpha1";
    public files: SignatureFileEntry[];

    constructor(raw: SignatureFilesEntryData) {
        this.files = raw.files;
    }

    public toDeterministicString() {
        let deterministicString = '';
        for (let entry of this.files) {
            deterministicString += entry.path + '\n' + entry.sha512 + '\n';
        }
        return deterministicString;
    }

    public async verify(context: VerificationContext): Promise<ModuleVerificationResult | null> {
        const skipPackageJsonExactVerification = context.signatureEntries.some(x => x.entry === "packageJson/v1alpha1");

        // For each relative file on disk, make sure it appears in
        // the list of files the signature is signing for.
        for (let relFileOnDisk of context.relFilesOnDisk) {
            let normalisedPath = relFileOnDisk.replace(/\\/g, '/');
            if (normalisedPath == 'signature.json') {
                continue;
            }
            if (normalisedPath == 'package.json' && skipPackageJsonExactVerification) {
                continue;
            }

            let found = false;
            let expectedHash = null;
            for (let expectedFile of this.files) {
                if (expectedFile.path == normalisedPath) {
                    found = true;
                    expectedHash = expectedFile.sha512;
                }
            }

            if (!found) {
                return {
                    status: ModuleVerificationStatus.Compromised,
                    reason: normalisedPath + ' exists in the package, but was not in the signature',
                    packageName: context.expectedPackageName,
                    untrustedIdentity: context.untrustedIdentity,
                    untrustedPackageVersion: context.untrustedPackageVersion,
                    isPrivate: context.isPrivate,
                };
            }
            
            const hash = await sha512OfFile(path.join(context.dir, normalisedPath));
            if (hash != expectedHash) {
                return {
                    status: ModuleVerificationStatus.Compromised,
                    reason: normalisedPath + ' does not have content that was signed for (mismatched hash)',
                    packageName: context.expectedPackageName,
                    untrustedIdentity: context.untrustedIdentity,
                    untrustedPackageVersion: context.untrustedPackageVersion,
                    isPrivate: context.isPrivate,
                };
            }
        }

        // For each file in the signature, make sure it appears in expected files.
        // We don't need to hash here because if there is a match we will have already
        // checked it in the for loop above.
        for (let fileEntry of this.files) {
            if (fileEntry.path == 'signature.json') {
                continue;
            }

            let found = false;
            for (let relFileOnDisk of context.relFilesOnDisk) {
                let normalisedPath = relFileOnDisk.replace(/\\/g, '/');
                if (normalisedPath == fileEntry.path) {
                    found = true;
                }
            }

            if (!found) {
                return {
                    status: ModuleVerificationStatus.Compromised,
                    reason: fileEntry.path + ' is expected by the signature, but is missing in the package',
                    packageName: context.expectedPackageName,
                    untrustedIdentity: context.untrustedIdentity,
                    untrustedPackageVersion: context.untrustedPackageVersion,
                    isPrivate: context.isPrivate,
                };
            }
        }

        // No invalidation of signature.
        return null;
    }

    getIdentity(): SignatureIdentity | null {
        // Does not provide identity information.
        return null;
    }
}

export interface SignatureFileEntry {
    path: string;
    sha512: string;
}

import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createHmac } from "node:crypto";

function credentialFingerprint(passwordHash: string): string {
  if (!process.env.NEXTAUTH_SECRET) throw new Error('NEXTAUTH_SECRET is required for Admin sessions');
  return createHmac('sha256', process.env.NEXTAUTH_SECRET).update(passwordHash).digest('hex');
}

function invalidateAdminToken<T extends { [key: string]: unknown }>(token: T): T {
  return { ...token, sub: undefined, name: undefined, email: undefined, role: undefined, adminCredentialFingerprint: undefined };
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const admin = await prisma.admin.findUnique({
          where: { email: credentials.email }
        });

        if (!admin || admin.role !== 'admin') {
           return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          admin.passwordHash
        );

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: admin.id.toString(),
          name: admin.name,
          email: admin.email,
          role: admin.role,
          adminCredentialFingerprint: credentialFingerprint(admin.passwordHash),
        };
      }
    })
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.adminCredentialFingerprint = (user as any).adminCredentialFingerprint;
        return token;
      }
      const id = Number(token.sub);
      if (!Number.isSafeInteger(id) || id <= 0 || typeof token.email !== 'string' || typeof token.adminCredentialFingerprint !== 'string') {
        return invalidateAdminToken(token);
      }
      const admin = await prisma.admin.findUnique({
        where: { id },
        select: { email: true, role: true, passwordHash: true },
      });
      if (!admin || admin.role !== 'admin' || admin.email !== token.email ||
          credentialFingerprint(admin.passwordHash) !== token.adminCredentialFingerprint) {
        return invalidateAdminToken(token);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        session.user.email = typeof token.email === 'string' ? token.email : null;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

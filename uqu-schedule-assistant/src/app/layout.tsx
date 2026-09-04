import type{Metadata}from"next";import{Geist,Geist_Mono}from"next/font/google";import"./globals.css";import{AppProvider}from"@/components/app-provider";import{Shell}from"@/components/shell";
const sans=Geist({subsets:["latin"],variable:"--font-sans"});
const mono=Geist_Mono({subsets:["latin"],variable:"--font-mono"});
export const metadata:Metadata={title:"UQU Schedule Assistant",description:"Private bilingual scheduling prototype for the UQU English Department"};export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body className={`${sans.variable} ${mono.variable}`}><AppProvider><Shell>{children}</Shell></AppProvider></body></html>}
